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

    // We should have no purge-cache requests to start with
    let openRequests = await helper.purgeCache.allPurgeRequests();
    assume(openRequests.requests).is.empty();

    // Request a purge-cache message
    await helper.purgeCache.purgeCache('dummy-provisioner', 'dummy-worker', {
      cacheName: 'my-test-cache',
    });

    // Wait for message and validate cacheName
    let m = await helper.events.waitFor('cache-purged');
    assume(m.payload.cacheName).is.equal('my-test-cache');

    // Check that the first request is valid
    openRequests = await helper.purgeCache.allPurgeRequests();
    assume(openRequests.requests.length).equals(1);
    let request = openRequests.requests[0];
    assume(request.cacheName).equals('my-test-cache');
    assume(request.provisionerId).equals('dummy-provisioner');
    assume(request.workerType).equals('dummy-worker');
    let firstExpires = new Date(request.expires);
    let delta = new Date(request.expires) - new Date(request.before);
    assume(delta).is.between(86399990, 86400010); // About a day

    // Check if we can override and update an existing request
    await helper.purgeCache.purgeCache('dummy-provisioner', 'dummy-worker', {
      cacheName: 'my-test-cache',
    });
    openRequests = await helper.purgeCache.allPurgeRequests();
    let newExpires = new Date(openRequests.requests[0].expires);
    assume(newExpires.valueOf()).is.gt(firstExpires.valueOf());

    // Add a second request
    await helper.purgeCache.purgeCache('dummy-provisioner', 'dummy-worker', {
      cacheName: 'my-test-cache-2',
    });
    openRequests = await helper.purgeCache.allPurgeRequests();
    assume(openRequests.requests.length).equals(2);

    // Finally try with different worker/provisioner
    await helper.purgeCache.purgeCache('dummy-provisioner-2', 'dummy-worker', {
      cacheName: 'my-test-cache',
    });
    await helper.purgeCache.purgeCache('dummy-provisioner', 'dummy-worker-2', {
      cacheName: 'my-test-cache',
    });
    openRequests = await helper.purgeCache.allPurgeRequests();
    assume(openRequests.requests.length).equals(4);

    let spec = await helper.purgeCache.purgeRequests('dummy-provisioner-2', 'dummy-worker');
    assume(spec.requests.length).equals(1);
    spec = await helper.purgeCache.purgeRequests('dummy-provisioner', 'dummy-worker-2');
    assume(spec.requests.length).equals(1);
    spec = await helper.purgeCache.purgeRequests('dummy-provisioner', 'dummy-worker');
    assume(spec.requests.length).equals(2);
  });
});
