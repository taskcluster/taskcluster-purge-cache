var config = require('typed-env-config');
var taskcluster = require('taskcluster-client');

var cfg = config({profile: 'verify'});

var purgeCache = new taskcluster.PurgeCache({
  credentials: cfg.taskcluster.credentials
});

purgeCache.purgeCache(
 'verifyprovisioner',
 'verifyworker',
 {cacheName: 'verifycache'}
);
