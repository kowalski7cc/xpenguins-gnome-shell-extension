const Meta = imports.gi.Meta;
const Cairo = imports.gi.cairo;

/* Notes to self.
 * Draw many actors in the global.stage?
 * global.stage has many actors, including the windows
 *
 * ** Create a new stage positioned in the global.stage to draw in.
 * --> if started on root window, this stage happens to cover (be??) global.stage.
 * * However then I have to move it whenever my parent window moves!
 * * OR one stage covering the whole window that gets is origin reset.
 *
 * CLUTTER.
 * Stage
 *  | - actors
 *
 *
 * clutter_init()
 * clutter_stage_get_default() == global.stage
 */

/* ToonLocateWindows 
 * Build up an X-region corresponding to the location of the windows 
 * that we don't want our toons to enter
 * Returns 0 on success, 1 if windows moved again during the execution
 * of this function .
 *
 * Jasper St Pierre: use clutter not g[td]k.
 */


function Region() {
    this._init.apply(this,arguments);
};

Region.prototype = {
    _init: function() {
        this.rectList = [];
        this.x_origin = 0;
        this.y_origin = 0;
    },

    set_origin: function(x,y) {
        this.x_origin = x;
        this.y_origin = y;
    },

    add_rectangle: function(rect) {
        this.rectList.push(rect);
    },

    union: add_rectangle,

    /* intersection */


};

/* For now, assume you can get the root window as an actor
 * (I recall seeing .get_window_type() == Meta.WindowType.DESKTOP somewhere)
 */
function LocateWindows( winActor ) {

    /* Cairo is the only toolkit I can find to have regions that 
     * are non-rectangular to build up. Bah! but the interface is not there!
     * Gdk 2.0 had them but they're removed in 3.0..
     * 
     * How to do it?
     */
    let toon_windows = new Region();
    toon_windows.set_origin( winActor.x, winActor.y );

    /* See if toon_root has moved with respect to toon_parent */

    /* Add windows to region */
    let winList = global.get_window_actors().map( function(w) { return w.meta_window; } );

    if ( GLOBAL.options.ignorePopups ) {
        // TODO: may want to include other window types too!
        winList = winList.filter( function(w) {
            return w.meta_window.get_window_type() == Meta.WindowType.NORMAL;
        });
    }

    /* sort by stacking */
    winList = global.display.sort_windows_by_stacking( winList );

    for ( let i=0; i<winList.length; ++i ) {
        /* ignore winActor */
        if ( winList[i] == winActor ) {
            continue;
        }

        if ( winList[i].get_compositor_private().mapped && winList[i].get_compositor_private().visible ) {

            /* ignore maximised windows */
            if (  GLOBAL.IGNORE_MAXIMISED_WINDOWS && 
                    winList[i].get_maximized() == 
                      (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL) ) {
                continue;
            }

            /* ignore windows behind winActor */
            Region.add_rectangle( winList[i].get_outer_rect() ); // TODO: relative to toon_parent?
        }
    } // window loop

    // bah: toon_windows.intersect(new_rectangle) gives the rectangle bounding box. Not the shape.
    // winList[0].meta_window.get_frame_bounds(): meant to return a Cairo.region
    // "Unable to find module implementing foreign type cairo.Region"
}
