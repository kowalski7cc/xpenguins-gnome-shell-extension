const Clutter = imports.gi.Clutter;
// TODO: temporary (use global.xxx instead in G-S-E)
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
Gtk.init(null);

const PENGUIN_MAX = 256;


// TOON dATA needs to be available (or THEME)

var warn = function(msg) { 
    log(msg);
    print(msg);
    global.log(msg);
};

var VERBOSE = true;
var _log = function(msg) {};
if ( VERBOSE ) {
    _log = warn;
}


/************************** KEEPERS ****************** ?
/* Get the 1-min averaged system load on linux systems - it's the
 * first number in the /proc/loadavg pseudofile. Return -1 if not
 * found. */
try {
    const GTop = imports.gi.Gtop;
    loadAverage() = function() {
        let loadavg = new GTop.glibtop_loadavg;
        GTop.glibtop_get_loadavg(loadavg);
        return loadavg.loadavg[0];
    };
} catch (err) {
    loadAverage() = function() {
        let load=-1;
        try {
            let str = Shell.get_file_contents_utf8_sync('/proc/loadavg');
            load = parseFloat(str.split(' ')[0]);
        } catch(err) {
            load = -1;
        }
        return load;
    };
};

removeDuplicates = function(arr) {
    let i=0, out=[], obj={};
    for ( i=0; i<arr.length; ++i ) {
        obj[arr[i]]=0;
    }
    for ( i in obj ) {
        out.push(i);
    }
    return out;
};

/* random int from 0 to (max-1) */
RandInt = function(max) {
    return Math.floor( Math.random()*max );
}

