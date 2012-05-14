const Clutter = imports.gi.Clutter;
// TODO: temporary (use global.xxx instead in G-S-E)
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
Gtk.init(null);

const PENGUIN_MAX = 256;

/* TODO: namespace? */
/* The window on which we draw the toons */
var XPenguinsWindow = {
    width:  Gdk.Screen.get_default().get_width(),
    height: Gdk.Screen.get_default().get_height()
};

/* The global stage. */
var XPenguinsStage;
try {
    XPenguinsStage = global.stage;
} catch (err) { 
    Clutter.init(null); // TODO: for standalone only, don't need it in extension
    XPenguinsStage = Clutter.Stage.get_default();
}

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

var removeDuplicates = function(arr) {
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
var RandInt = function(max) {
    return Math.floor( Math.random()*max );
}

