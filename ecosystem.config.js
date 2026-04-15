// PM2 ecosystem config for the D2R Randomizer Hostinger deployment.
//
// Install PM2 on the VPS, then:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup            # one-shot; follow the printed instruction
//   pm2 install pm2-logrotate   # keep ~/.pm2/logs from filling disk
//
// Single long-running instance is intentional (in-memory queue + zip cache +
// rate-limit buckets are all process-local). Don't run this in cluster mode
// without first swapping those for shared-state alternatives.

module.exports = {
  apps: [
    {
      name: 'd2rr',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/d2rrandomizer', // adjust to actual deploy path
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        // Thread-pool tuning. See src/lib/sprites/icon-assembler.ts for the
        // corresponding in-process sharp.concurrency() setting.
        VIPS_CONCURRENCY: '2',
        UV_THREADPOOL_SIZE: '4',
        // Counter file lives one level above the project root so deploys that
        // wipe the repo can't zero it.
        COUNTER_FILE: '/var/www/counter.json',
      },
      // Auto-restart if the process memory footprint runs away (sprite caches +
      // zip buffers can sum to ~800MB under load).
      max_memory_restart: '1500M',
      // Back off restarts if we're crashing on boot.
      min_uptime: '30s',
      max_restarts: 5,
      restart_delay: 2000,
      // Stdout/stderr split so nginx-style log tooling can tail just errors.
      out_file: '/var/log/d2rr/out.log',
      error_file: '/var/log/d2rr/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
