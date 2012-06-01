const Meta = imports.gi.Meta;
//const Cairo = imports.gi.cairo;

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
 */

/* BIG TODO: use Clutter.Geometry or Meta.Rectangle? */
function Region() {
    this._init.apply(this, arguments);
}

Region.prototype = {
    _init: function () {
        this.rectangles = [];
        this.extents = new Meta.Rectangle();
    },

    add_rectangle: function (rect) {
        this.rectangles.push(rect);
        /* update extents */
        this.extents = this.extents.union(rect);
    },

    union: function () {
        this.add_rectangle(arguments);
    },

    clear: function () {
        this.rectangles = [];
        this.extents.x = 0;
        this.extents.y = 0;
        this.extents.width = 0;
        this.extents.height = 0;
    },
/* // only do this if you intend for a [i] method?
    get length(): {
        return this.rectangles.length;
    },
*/
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
    overlaps: function (x, y, width, height) {
        // TODO: make faster! will be doing this once per toon per frame!
        //  --> sort the window list so that you know where to start iterating?!

        let rect = new Meta.Rectangle({x: x, y: y, width: width, height: height});
        /* quick check */
        if (this.rectangles.length === 0 || !this.extents.overlap(rect)) {
            return false;
        }

        let i = this.rectangles.length;
        while (i--) {
            if (this.rectangles[i].overlap(rect)) {
                return true;
            }
        }
        return false;
    }
};
