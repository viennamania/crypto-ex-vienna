const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const parseDotEnv = (filename) => {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) return;
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
};

const ensureUserWalletIndexes = async () => {
  parseDotEnv('.env');

  const mongoUri = process.env.MONGODB_URI;
  const mongoDbName = process.env.MONGODB_DB_NAME;
  if (!mongoUri || !mongoDbName) {
    throw new Error('MONGODB_URI or MONGODB_DB_NAME is missing.');
  }

  const client = new MongoClient(mongoUri);
  await client.connect();
  try {
    const users = client.db(mongoDbName).collection('users');
    const walletPattern = /^0x[a-fA-F0-9]{40}$/;

    const cursor = users.find(
      {},
      {
        projection: {
          _id: 1,
          walletAddress: 1,
          walletAddressNormalized: 1,
        },
      },
    );

    const bulkOps = [];
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const walletAddress = String(doc?.walletAddress || '').trim();
      const normalizedWalletAddress = walletAddress.toLowerCase();
      const hasNormalizedField = Object.prototype.hasOwnProperty.call(doc || {}, 'walletAddressNormalized');
      const walletAddressNormalized = String(doc?.walletAddressNormalized || '').trim().toLowerCase();
      const isValidWalletAddress = walletPattern.test(walletAddress);

      if (isValidWalletAddress) {
        const needsWalletAddressUpdate = walletAddress !== normalizedWalletAddress;
        const needsNormalizedFieldUpdate = walletAddressNormalized !== normalizedWalletAddress;
        if (!needsWalletAddressUpdate && !needsNormalizedFieldUpdate) {
          continue;
        }
        const setPayload = {
          walletAddress: normalizedWalletAddress,
          walletAddressNormalized: normalizedWalletAddress,
        };
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: setPayload },
          },
        });
      } else if (hasNormalizedField) {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $unset: {
                walletAddressNormalized: '',
              },
            },
          },
        });
      }

      if (bulkOps.length >= 500) {
        await users.bulkWrite(bulkOps, { ordered: false });
        bulkOps.length = 0;
      }
    }
    if (bulkOps.length > 0) {
      await users.bulkWrite(bulkOps, { ordered: false });
    }

    await users.createIndex(
      { walletAddress: 1 },
      {
        name: 'idx_users_walletAddress_ci',
        collation: { locale: 'en', strength: 2 },
        sparse: true,
      },
    );

    await users.createIndex(
      { walletAddressNormalized: 1 },
      {
        name: 'idx_users_walletAddressNormalized',
        sparse: true,
      },
    );

    await users.createIndex(
      { storecode: 1, walletAddressNormalized: 1 },
      {
        name: 'uniq_users_storecode_walletAddressNormalized',
        unique: true,
        partialFilterExpression: {
          walletAddressNormalized: { $exists: true },
        },
      },
    );

    const indexes = await users.indexes();
    console.log('users indexes:', indexes.map((item) => item.name));
  } finally {
    await client.close();
  }
};

ensureUserWalletIndexes()
  .then(() => {
    console.log('Done.');
  })
  .catch((error) => {
    console.error('Failed to ensure indexes:', error);
    process.exitCode = 1;
  });
