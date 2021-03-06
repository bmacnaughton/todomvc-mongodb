'use strict';

const https = require('https');
const url = require('url');

// https://docs.appoptics.com/api/#annotations

class Annotations {
  constructor (key, opts = {}) {
    if (!key) {
      throw new Error('Annotations() requires a key');
    }
    this.key = key;

    // defaults
    this.defaults = Object.assign({}, opts);

    // url processing.
    if (opts.url) {
      this.url = opts.url;
      if (this.url[this.url.length - 1] === '/') {
        this.url = this.url.slice(0, -1);
      }
    } else {
      this.url = 'https://api.appoptics.com/v1/annotations';
    }

    this.sent = 0;

    this.errorCount = 0;
    this.lastErrorEvent = undefined;

    this.non200Count = 0;
    this.lastNon200 = undefined;
    this.lastNon200Received = undefined;

  }

  send (streamName, title, opts = {}) {
    const defaults = Object.assign({title}, this.defaults, opts);

    let pres;
    let prej;
    const p = new Promise((resolve, reject) => {
      pres = resolve;
      prej = reject;
    });

    const times = {
      start_time: Math.round(Date.now() / 1000),
    };
    const body = Object.assign({}, times, defaults);

    const payload = JSON.stringify(body);

    const u = url.parse(`${this.url}/${streamName}`);
    const port = u.port || u.protocol === 'https:' ? 443 : 80;

    // save the http request options.
    this.options = {
      hostname: u.hostname,
      port,
      path: u.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(this.key + ':').toString('base64'),
        'Content-Length': payload.length,
      }
    };

    let not200 = false;
    const req = https.request(this.options, res => {
      this.sent += 1;

      if (res.statusCode !== 200) {
        not200 = true;
        this.non200Count += 1;
        this.lastNon200 = res.statusCode;
      }

      let received = [];
      res.on('data', d => {
        received.push(d.toString('utf8'));
      })

      res.on('end', () => {
        received = received.join('');
        this.lastReceived = received;
        if (not200) {
          this.lastNon200Received = received;
        }
        pres({headers: res.headers, statusCode: res.statusCode, body: received});
      })
    })

    req.on('error', e => {
      this.errorCount += 1;
      this.lastErrorEvent = e;
      prej(e);
    })

    req.write(payload);
    req.end();

    return p;
  }

  getStats () {
    return {
      sent: this.sent,
      errorCount: this.errorCount,
      lastErrorEvent: this.lastErrorEvent,
      non200Count: this.non200Count,
      lastNon200: this.lastNon200,
      lastNon200Received: this.lastNon200Received,
    };
  }
}

module.exports = Annotations

//
// simple test
//
//if (!module.parent || module.parent.id === '<repl>') {
//  console.log(process.argv)
//  const a = new Annotations(process.env.AO_SWOKEN_PROD);
//  a.send('todo-server-started', 'information about the versions and commit tag')
//    .then(r => console.log(r));
//}

//
// make this a simple command line utility.
//
if (!module.parent) {
  const os = require('os');
  if (process.argv.length < 5) {
    console.log('syntax: annotations key tag description [source=os.hostname()]');
    console.log('  e.g., ./annotations $AO_TOKEN_PROD "started-the-server" "lots of details"');
    process.exit(1);
  }
  const options = {source: process.argv[5] || os.hostname()};
  const a = new Annotations(process.argv[2], options);
  a.send(process.argv[3], process.argv[4])
    .then(r => {
      if (r.statusCode >= 200 && r.statusCode < 300) {
        process.exit(0);
      }
      console.log(r);
      process.exit(1);
    });
}

