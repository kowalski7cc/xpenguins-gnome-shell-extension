/* Minimal working example */
/* NOTE: need to do 
 GJS_PATH=`pwd` gjs mwe.js
 */
const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const TestsToDo = { Theme: true, 
                    ThemeManager: false,
                    Clutter: true,
                    Toon: true
};
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const Lang = imports.lang;

/* Import my JS files */
const Toon = imports.toon.Toon; 
const ThemeManager = imports.theme_manager.ThemeManager;
const Theme = imports.theme.Theme;


/* to get stuff working */
const fileUtils = {
    listDirAsync: function(file, callback) {
        let allFiles = [];
        file.enumerate_children_async(Gio.FILE_ATTRIBUTE_STANDARD_NAME,
                                      Gio.FileQueryInfoFlags.NONE,
                                      GLib.PRIORITY_LOW, null, function (obj, res) {
            let enumerator = obj.enumerate_children_finish(res);
            function onNextFileComplete(obj, res) {
                let files = obj.next_files_finish(res);
                if (files.length) {
                    allFiles = allFiles.concat(files);
                    enumerator.next_files_async(100, GLib.PRIORITY_LOW, null, onNextFileComplete);
                } else {
                    enumerator.close(null);
                    callback(allFiles);
                }
            }
            enumerator.next_files_async(100, GLib.PRIORITY_LOW, null, onNextFileComplete);
        });
    }
};
const Shell = {
    get_file_contents_utf8_sync: function(path) {
        obj = GLib.file_get_contents(path);
        if ( !obj[0] ) {
            return null;
        }
        return obj[1].toString();
    }
};


/** TEST ThemeManager **/
if ( TestsToDo['ThemeManager'] ) {
    // get_theme_path
    // PASS
    print( 'ThemeManager.get_theme_path("Penguins"): ' + ThemeManager.get_theme_path('Penguins') );
    // list_themes
    // FAIL: it seems the problem is in the asynchronous?
    // NOTE: if you do Clutter.Main() then at least a print statement 
    // inside the listDirAsync will print out. But we have to somehow
    // wait for the output!
    print( 'ThemeManager.list_themes(): ' + ThemeManager.list_themes() ); // NO
}


/** TEST Theme **/
if ( TestsToDo['Theme'] ) {
    // create empty theme & append
    var theme = new Theme.Theme([]);
    // print('empty theme: ' + theme);
    theme.append_theme('Penguins');       // seems OK
    print('appended Penguins. printout:');
    print(JSON.stringify(theme,null,4));  // seems OK
    // create a new theme, include a one-genus theme to test
    theme = new Theme.Theme(['Turtles', 'Penguins']);
    print('Turtles & Penguins');
    print(JSON.stringify(theme,null,4));  // seems OK

    // try with *duplicate* ToonData
    // woohoo!
    print('testing master stuffs: Penguin[normal].explosion == Penguin[skateboarder].explosion.master: ' +
           (theme.ToonData[1].explosion == theme.ToonData[2].explosion.master).toString());
    print('textures equal? : ' + (theme.ToonData[1].explosion.texture == theme.ToonData[2].explosion.texture).toString());
}

if ( TestsToDo['Toon'] ) {
    /* This *might* work but Toon is needed in theme.js so
     * it gets loaded too early, too bad(?)
     */
    var toon = new Toon.Toon(theme.ToonData, {genus:1},
            theme.ToonData[1]['walker'].texture); 
    toon.set_position(0,0); // ARGH why does this say it can't do it?

    /* CAN'T WORK OUT HOW TO INITIALISE EMPTY IN GNOME 3.2 */
    /* initialise empty */
    /*
    toon = new Toon.Toon(theme.ToonData);
    // BIGTODO: toon.set_genus('genus_name'); & this.theme ?
    toon.genus = 1;
    toon.init();
    */


}

/* Try to draw a penguin onto the global stage? */
if ( TestsToDo['Clutter'] ) {
// The actor's position is relative to the top-left (0, 0) of the 
// parent container (such as the stage), but this origin can be 
// changed by calling clutter_actor_set_anchor_point().

// So Toon.set_anchor_point( XPenguinsWindow.get_position() )
// ToonActor.show()
// .get_default() has been depreciated since v1.10 and should not be used.
// Use .new() instead (!!)

// Shell version can just use global.stage.{width,height}

/* TEST 1: draw on a new stage. */
/* NEXT TODO: make a stage stick to a window & be transparent & clickthrough */
let ScreenWidth=1000, ScreenHeight=500; // 1024 x 600 for grug.
Clutter.init(null);
    let blue = new Clutter.Color({blue: 255, red:0, green:0, alpha:255});

    /* Set the stage */
    // NOTE: get_default() this is not the global stage (from gjs anyway) but spawns a new win
    // should prolly create my own stage and stick it in to the window (?)

    // new Clutter.Stage
    let XPenguinsStage = Clutter.Stage.new();
        XPenguinsStage.set_size( ScreenWidth, ScreenHeight );
        // if XPenguinsStage.visible don't show
        XPenguinsStage.show(); 
        // XPenguinsStage.set_background_color(); apparently default transparent.
        // Ahh, but the window it sticks to is *not* transparent.
        // HOW TO DO ? just add this stage to the global stage?
        // when I make a new stage from the looking glass it appears to die at set_size

    /* Add a rectangle actor to the stage: */
    let rect = new Clutter.Rectangle();
    rect.set_color( blue );
    rect.set_size( 100, 100 );
    rect.set_position( 20, 20 );
    XPenguinsStage.add_actor( rect );
    rect.show();

    // let cln = new Clutter.Clone({source:tmp}); 

    /* Cannot display Clutter.Clone unless the ToonData
     * is also added to the stage first : do in some sort of initalisation.
     */
    XPenguinsStage.add_actor( toon.data.texture );
    toon.data.texture.hide();

    toon.set_position(0,0);
    toon.set_source(toon.data.texture);
    XPenguinsStage.add_actor(toon);
    toon.active = true; // todo: what does that?
    //print(toon.direction); // note: if i remove this it dies.
    toon.Draw();
    toon.show();
    // toon.Advance(Toon.MOVE)
    print(toon.get_clip());

    /* Set up a timeline */
    let timeline = new Clutter.Timeline();
    let theTime = new Date().getTime();
    timeline.set_duration(2000);
    timeline.set_repeat_count(0); 
    // Depreciated (default: sync w/ refresh rate of display)
    // Clutter.set_default_frame_rate(1); //fps

    let nFrames = 0;
    timeline.connect('new-frame', function() { 
        rect.move_by( 1, 0 );
        nFrames++;
        //print(timeline.get_delta());
        //print(rect.get_position());
        //print('n frames: ' + nFrames);
    } );

    timeline.connect('completed', function(tl) {
        print('finished!');
        print( tl.get_elapsed_time() + 'ms ' + nFrames + 'frames ' + nFrames/tl.get_elapsed_time()*1000 + 'fps');
        // can't work out fps
    });
    timeline.start();

    // note: a *non-reactive* stage passes through clicks.

/* Start the main loop, so we can respond to events: */
Clutter.main();
};

/*
 * Clutter.Texture.new_from_file is an actor loading an image
 * Making your own actors:
 * http://www.openismus.com/documents/clutter_tutorial/0.8/docs/tutorial/html/appendix-implementing-actors.html
 * implement:
 * - paint method
 * - pick method
 * (err this is not really what I want to do)
 *
 * Scrolling example
 * http://www.openismus.com/documents/clutter_tutorial/0.8/docs/tutorial/html/scrolling-container-example.html
 */
/* Actor.set_clip sets the clipping region */
/* Actor.move-by */
/* Clutter group to store the toon actors?: child actors position *relative* to the group */
/*
 * Root display stage (global.stage).
 * |- Clutter.Group "stuck" to the particular window, listening to close, resize, etc events.
 *    |- Toon Actors.
 *       |- events for when you click/move cursor over the actor (*CURSOR THIEF*)
 *       (OR: handle events from stage & use actor_at_pos to work out which actor)
 *       callback returns TRUE if you're done processing event, or FALSE if you want to 
 *       pass it on to the next.
 *       More on events: http://www.openismus.com/documents/clutter_tutorial/0.8/docs/tutorial/html/sec-actors-events.html
 *
 * Handle main loop via Clutter Timeline object?
 * Clutter.Timeline.set_loop,start,stop
 *
 * TODO: don't have to  update ToonWindows() every cycle, only when a window-moved etc event
 * is fired?
 *
 *
 */


/* AWESOME: get the actor for the window we want to draw on
 * via global.get_window_actors().
 * There's one that has  Meta.WindowType.DESKTOP for its get_window_type()
 *
 * You can add an actor to it and it WORKS BOOYAH
 * Position is relative already.
 */

/* Hmm.
 * ToonData is an object.
 * |- .image == Clutter.Texture (OR: "COGL texture")
 *
 * Toon is a Clutter.Clone( of its toon type ) + toon.set_source
 *  OR: Clutter.Texture with set_cogl_texture( ToonData.image )
 * Remember - toons can change type!
 *
 *                    [ToonData]         [Toon]
 * Which way to go? Clutter.Texture + Clutter.Clone, or 
 *                     Cogl.Texture + Clutter.Texture?
 */
