const Meta = imports.gi.Meta;

/* ToonLocateWindows (toon_core.c)
 * Build up an X-region corresponding to the location of the windows
 * that we don't want our toons to enter.
 */
function Region() {
    this._init.apply(this, arguments);
}

Region.prototype = {
    _init: function () {
        this.rectangles = [];
        this._extents = new Meta.Rectangle();
    },

    addRectangle: function (rect) {
        this.rectangles.push(rect);
        /* update _extents */
        this._extents = this._extents.union(rect);
    },

    union: function () {
        this.addRectangle(arguments);
    },

    clear: function () {
        this.rectangles = [];
        this._extents.x = 0;
        this._extents.y = 0;
        this._extents.width = 0;
        this._extents.height = 0;
    },

    /* determines whether the specified rect overlaps with the region.
     * x, y: x & y coordinates of the upper-left corner of the rectangle
     * width, height: width and height of the rectangle.
     *
     * Returns true if `rect` is partially or fully in the region,
     * and false if it's entirely out.
     */
    overlaps: function (x, y, width, height) {
        let rect = new Meta.Rectangle({x: x, y: y, width: width, height: height});
        /* quick check */
        if (this.rectangles.length === 0 || !this._extents.overlap(rect)) {
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
