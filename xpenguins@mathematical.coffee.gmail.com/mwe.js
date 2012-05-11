/* Minimal working example */
/* NOTE: need to do 
 GJS_PATH=`pwd` gjs mwe.js
 */

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

/* Import other JS files + namespaces */
const Toon = imports.toon.Toon; 
const ThemeManager = imports.theme_manager.ThemeManager;
const Theme = imports.theme.Theme;


/** TEST ThemeManager **/
print( 'ThemeManager.get_theme_path("Penguins"): ' + ThemeManager.get_theme_path('Penguins') ); // YEP
print( 'ThemeManager.list_themes(): ' + ThemeManager.list_themes() ); // NO


/* For now, draw the entire pixmap onto the global stage */
let pixmapPath = './themes/Penguins/walker.xpm';

let ToonData = {
    walker: {
        width: 30,
        height: 30,
        nframes: 8,
        speed: 4,
        ndirections: 2,
        acceleration: 0,
        terminal_velocity: 0,

        loop: 0,

        conf: 0,
        filename: GLib.build_filenamev([GLib.get_home_dir(),'sandbox','m.c-gnome-shell-extensions',
                'xpenguins', 'xpenguins@mathematical.coffee.gmail.com', 'themes', 'Penguins', 'walker.xpm']),
        image: null,
        master: null,
        pixmap: null,
        mask: null
    }
}

Clutter.init(null);
let XPenguinsStage = Clutter.Stage.get_default();

