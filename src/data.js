let assert = require('assert');
let Entity = require('azure-entities');

/**
 * Entity for tracking which caches are currently
 * requested for busting. This allows workers to check-in
 * with purge-cache from time-to-time to see what should
 * be purged.
 *
 */
let CacheBuster = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.CompositeKey('provisionerId', 'workerType'),
  rowKey:           Entity.keys.StringKey('cacheName'),
  properties: {
    provisionerId:  Entity.types.String,
    workerType:     Entity.types.String,
    cacheName:      Entity.types.String,
    before:         Entity.types.Date,
    expires:        Entity.types.Date,
  },
});

/**
 * Expire cacheBusters that are past their expiration.
 *
 * Returns a promise that all expired cacheBusters have been deleted
 */
CacheBuster.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  var count = 0;
  await Entity.scan.call(this, {
    expires:          Entity.op.lessThan(now),
  }, {
    limit:            250, // max number of concurrent delete operations
    handler:          (cacheBuster) => {
      count++;
      return cacheBuster.remove(true);
    },
  });
  return count;
};

module.exports = {CacheBuster};
