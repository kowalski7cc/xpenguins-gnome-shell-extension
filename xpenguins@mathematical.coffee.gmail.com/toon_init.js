/* Startup toon functions, toon_init.c */
/* Depreciated:
 * Toon.OpenDisplay (no support for opening display by name)
 * global['gdk-screen'], global['screen']
 * global['screen-width']
 * global['background-actor'] : actor drawing root window background
 *
 * toon_parent == global.(display|actor|??)
 *
 *
 * toon_root.c: we want the window IDs of
 * 1) the background window that is behind the toplevel client windows;
 *    this is the window we draw on.
 * 2) the parent window of the toplevel client windows; this is used by
 *    ToonLocateWindows() to build up a map of the space the toons can occupy
 */

// GLOBAL.XPenguinsWindow <---

/* Use the Toon namespace */
Toon = Toon || {};

/* Setup graphics context and create some XRegions 
 * ToonInit
 * TODO: WHAT IF XPENGUINS_WINDOW IS JUST THE ROOT WINDOW?
 */
Toon.Init = function( xpenguins_window ) {
    // TODO: make sure the change sticks
    /* Populate GLOBAL.XPenguinsWindow.
     * This contains both the x & y offset to the window (from the global.display),
     * and the width/height of the window.
     */
    // TODO: listen to resizes
    GLOBAL.XPenguinsWindow = xpenguins_window.get_input_rect();

    /* If we want to squish the toons with the mouse then we must create
     * a window over the root window that has the same properties. */
    // TODO
    if ( GLOBAL.toon_squish ) {
    }

    // TODO (do I have to?)
    /* Is anyone interested in this window? If so we must inform them of
    * where the toons are by sending expose events - that way they can
    * redraw themselves when a toon walks over them */

    // more stuff to do with graphics contexts.

    /* Notify if the location of XPenguinsWindow changes
     * or if the window we are drawing to changes size
     */
    XPenguinsWindow.get_compositor_private().connect('position-changed', stub);
    XPenguinsWindow.get_compositor_private().connect('size-changed', stub);
    XPenguinsWindow.get_compositor_private().connect('destroy', stub); // terminate XPenguins
}

stub = function() {
}

/* Configure signal handling and the way the toons behave via a bitmask 
 * ToonConfigure
 */
Toon.Configure = function( code ) {
}

/* Store the pixmaps to the server 
 * ToonInstallData
 */
Toon.InstallData = function( data, ngenera, ntypes ) {
}
