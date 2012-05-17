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

/* BIG TODO: use Clutter.Geometry or Meta.Rectangle? */
function Region() {
    this._init.apply(this,arguments);
};

Region.prototype = {
    _init: function() {
        this.rectList = [];
        this.extents = new Meta.Rectangle();
    },

    add_rectangle: function(rect) {
        this.rectList.push(rect);
        /* update extents */
        this.extents = this.extents.union(rect);
    },

    union: add_rectangle,

    /* determines whether the specified rect overlaps with the region.
     *
     * x, y: x & y coordinates of the upper-left corner of the rectangle
     * width, height: width and height of the rectangle.
     *
     * Returns true if `rect` is partially or fully in the region,
     * and false if it's entirely out.
     * (XRectInRegion returns RectangleOut, RectangleIn and RectanglePart,
     * but XPenguins only needs RectangleOut vs !RectangleOut).
     */
    overlaps: function(x, y, width, height) {
        // TODO: make faster! will be doing this once per toon per frame!
        //  --> sort the window list so that you know where to start iterating?!
        
        let rect = new Meta.Rectangle({x:x, y:y, width:width, height:height});
        /* quick check */
        if ( this.rectList.length == 0 || !this.extents.overlap(rect) ) {
            return false;
        }

        let i = this.rectList.length;
        while ( i-- ) {
            if ( this.rectList[i].overlap(rect) ) {
                return true;
            }
        }
        return false;
    }
};

/* For now, assume you can get the root window as an actor
 * (I recall seeing .get_window_type() == Meta.WindowType.DESKTOP somewhere)
 * ToonLocateWindows
 */
function updateWindows( winActor, options ) {

    /* Cairo is the only toolkit I can find to have regions that 
     * are non-rectangular to build up. Bah! but the interface is not there!
     * Gdk 2.0 had them but they're removed in 3.0..
     * 
     * How to do it?
     */
    let toon_windows = new Region();
    toon_windows.set_origin( winActor.x, winActor.y );

    // BIG TODO: are penguins confined to one workspace?
    // add a toggle. If so, sleep while on another workspace.
    // BIG TODO: if winActor isn't currently visible pause? Don't run in background.
    
    /* Add windows to region (only ones on current workspace) */
    let winList = global.screen.get_active_workspace.list_windows();
    // TODO: add global.stage to this?

    if ( options.ignorePopups ) {
        // TODO: may want to include other window types too!
        winList = winList.filter( function(w) {
            return w.get_window_type() == Meta.WindowType.NORMAL;
        });
    }

    /* sort by stacking: lowest to highest. 
     * The only windows that have a chance of being on top of you are after you on the list.
     * This handles windows spread over two monitors too.
     */
    winList = global.display.sort_windows_by_stacking( winList );

    /* iterate through backwards: every window up to winList[i]==winActor has a chance
     * of being on top of you. Once you hit winList[i]==winActor, the other windows
     * are *guaranteed* to be behind you.
     */
    let i=winList.length;
    while ( i-- ) {
        /* exit once you hit the window actor */
        if ( winList[i] == winActor ) {
            break;
        }
        if ( winList[i].get_compositor_private().mapped && winList[i].get_compositor_private().visible ) {
            /* ignore maximised windows */
            if (  options.ignoreMaximised && 
                    winList[i].get_maximized() == 
                      (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL) ) {
                continue;
            }

            /* ignore windows behind winActor */
            // 0,0 is top-left corner
            Region.add_rectangle( winList[i].get_outer_rect() ); // TODO: relative to toon_parent?
        }
    }
    // bah: toon_windows.intersect(new_rectangle) gives the rectangle bounding box. Not the shape.
    // winList[0].meta_window.get_frame_bounds(): meant to return a Cairo.region
    // "Unable to find module implementing foreign type cairo.Region"
}
