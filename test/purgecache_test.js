suite('Purge-Cache', () => {
  let helper = require('./helper');
  let assume = require('assume');

  test('ping', () => {
    return helper.purgeCache.ping();
  });

  test('Publish Purge-Cache Message', async () => {
    // Start listening for message
    await helper.events.listenFor('cache-purged',
      helper.purgeCacheEvents.purgeCache({
        provisionerId:  'dummy-provisioner',
        workerType:     'dummy-worker',
      })
    );

    // Request a purge-cache message
    await helper.purgeCache.purgeCache('dummy-provisioner', 'dummy-worker', {
      cacheName: 'my-test-cache',
    });

    // Wait for message and validate cacheName
    let m = await helper.events.waitFor('cache-purged');
    assume(m.payload.cacheName).is.equal('my-test-cache');
  });

});
