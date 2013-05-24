/* various utility functions */

/* Get the 1-min averaged system load on linux systems - it's the
 * first number in the /proc/loadavg pseudofile. Return -1 if not
 * found. */
function loadAverage() {
    return -1;
}
try {
    const Shell = imports.gi.Shell;
    const GLib = imports.gi.GLib;
    loadAverage = function () {
        let load = -1;
        if (GLib.file_test('/proc/loadavg', GLib.FileTest.EXISTS)) {
            try {
                load = Shell.get_file_contents_utf8_sync('/proc/loadavg');
                load = parseFloat(load.split(' ')[0]);
            } catch (err) {
                load = -1;
            }
        }
        return load;
    };
} catch (err) {
    try {
        // NOTE: this sometimes causes a segfault (in GNOME 3.4; don't know why)
        const GTop = imports.gi.GTop;
        loadAverage = function () {
            let loadavg = new GTop.glibtop_loadavg();
            GTop.glibtop_get_loadavg(loadavg);
            return loadavg.loadavg[0];
        };
    } catch (err) {
        // catch-all: disable load averaging.
        loadAverage = function () {
            return -1;
        }
    }
}

function removeDuplicates(arr) {
    let i = 0, out = [], obj = {};
    for (i = 0; i < arr.length; ++i) {
        obj[arr[i]] = 0;
    }
    for (i in obj) {
        if (obj.hasOwnProperty(i)) {
            out.push(i);
        }
    }
    return out;
}

/* random int from 0 to (max-1) */
function RandInt(max) {
    return Math.floor(Math.random() * max);
}

/* Utility logging function */
function LOG() {
    let msg = arguments[0];
    if (arguments.length > 1) {
        [].shift.call(arguments);
        msg = ''.format.apply(msg, arguments);
    }
    //log(msg);
    return msg;
}

function DEBUG() {
//    LOG.apply(null, arguments);
}

/* utility warning function */
function warn() {
    let msg = LOG.apply(null, arguments);
    log(msg);
    global.log(msg);
}

function error() {
    let msg = LOG.apply(null, arguments);
    log(msg);
    global.log(msg);
    throw new Error(msg);
}
