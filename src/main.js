let debug             = require('debug')('purge-cache');
let path              = require('path');
let Promise           = require('promise');
let _                 = require('lodash');
let config            = require('typed-env-config');
let loader            = require('taskcluster-lib-loader');
let monitor           = require('taskcluster-lib-monitor');
let validate          = require('taskcluster-lib-validate');
let server            = require('taskcluster-lib-app');
let taskcluster       = require('taskcluster-client');
let api               = require('./api');
let exchanges         = require('./exchanges');
let data              = require('./data');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },
  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validate({
      prefix:  'purge-cache/v1/',
      aws:      cfg.aws,
    }),
  },
  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: 'purge-cache',
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  CacheBuster: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      let CacheBuster = data.CacheBuster.setup({
        table:            cfg.app.cacheBusterTableName,
        credentials:      cfg.azure,
        monitor:          monitor.prefix('table.cachebusters'),
      });
      await CacheBuster.ensureTable();
      return CacheBuster;
    },
  },

  'expire-cache-busters': {
    requires: ['cfg', 'CacheBuster', 'monitor'],
    setup: async ({cfg, CacheBuster, monitor}) => {
      let now = taskcluster.fromNow(cfg.app.cacheBusterExpirationDelay);
      assert(!_.isNaN(now), 'Can\'t have NaN as now');

      // Expire task-groups using delay
      debug('Expiring cache-busters at: %s, from before %s', new Date(), now);
      let count = await CacheBuster.expire(now);
      debug('Expired %s cache-busters', count);

      monitor.count('expire-cache-busters.done');
      monitor.stopResourceMonitoring();
      await monitor.flush();
    },
  },

  publisher: {
    requires: ['cfg', 'validator', 'monitor'],
    setup: ({cfg, validator, monitor}) =>
      exchanges.setup({
        credentials:        cfg.pulse,
        exchangePrefix:     cfg.app.exchangePrefix,
        validator:          validator,
        referencePrefix:    'purge-cache/v1/exchanges.json',
        publish:            process.env.NODE_ENV === 'production',
        aws:                cfg.aws,
        monitor:            monitor.prefix('publisher'),
      }),
  },

  api: {
    requires: ['cfg', 'monitor', 'validator', 'publisher'],
    setup: ({cfg, monitor, validator, publisher}) => api.setup({
      context:          {publisher},
      validator:        validator,
      publish:          process.env.NODE_ENV === 'production',
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'purge-cache/v1/api.json',
      monitor:          monitor.prefix('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => {

      debug('Launching server.');
      let app = server(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
  },
}, ['profile', 'process']);

if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
