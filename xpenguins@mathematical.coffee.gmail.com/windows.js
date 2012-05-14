const Meta = imports.gi.Meta;

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

// Root window: global.stage.get_allocation_geometry()
// parentWindow is either root window (stage?!) OR a toplevel window.
function LocateWindows( winActor ) {

    let toon_windows = new Meta.Rectangle();

    /* Get children of parent window */

    // GAH: PARENT WINDOW MUST BE FED IN AS Meta.Window but how do you get the **ROOT** window?
    // hmm. global.stage.get_allocation_geometry() seems to be the same.


}
