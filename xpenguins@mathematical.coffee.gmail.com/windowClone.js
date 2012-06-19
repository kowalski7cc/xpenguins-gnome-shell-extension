const Clutter = imports.gi.Clutter;
const Lang    = imports.lang;
const Meta    = imports.gi.Meta;
const Signals = imports.signals;

/* XPenguinsWindow.
 * all it is is a wrapper around the polyglot bits:
 * get_workspace and retrieving the proper x/y/width/height
 * (recall that MetaWindowActors have a slightly off x/y/width/height)
 */
function XPenguinsWindow() {
    this._init.apply(this, arguments);
}

XPenguinsWindow.prototype = {
    _init: function (baseWindow, onAllWorkspaces) {
        this.actor = baseWindow;
        this._destroyID = this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        if (baseWindow instanceof Meta.WindowActor) {
            this.meta_window = this.actor.meta_window;
            this.get_workspace = Lang.bind(this.meta_window,
                this.meta_window.get_workspace);

            // NOTE: right and bottom are inclusive of the last pixel.
            /* position, width, height must come from the meta window */
            this.get_box = Lang.bind(this, function () {
                let rect = this.meta_window.get_outer_rect();
                return { 
                    left: rect.x,
                    right: rect.x + rect.width - 1,
                    top: rect.y,
                    bottom: rect.y + rect.height - 1,
                    width: rect.width,
                    height: rect.height,
                };
            });
        } else {
            /* position, width, height come from the actor */
            this.get_box = Lang.bind(this, function () {
                return { 
                    left: this.actor.x,
                    right: this.actor.x + this.actor.width - 1,
                    top: this.actor.y,
                    bottom: this.actor.y + this.actor.height - 1,
                    width: this.actor.width,
                    height: this.actor.height,
                };
            });
            if (onAllWorkspaces) {
                // always return the 'current' workspace
                this.get_workspace = Lang.bind(global.screen,
                    global.screen.get_active_workspace);
            } else {
                // starting workspace
                let ws = global.screen.get_active_workspace();
                this.get_workspace = function () {
                    return ws;
                }
            }
        }
        this.actor._delegate = this;
    },

    _onDestroy: function () {
        /* remove references */
        this.meta_window = null;
        this.actor.disconnect(this._destroyID);
        this._destroyID = null;
        this.actor._delegate = null;
        this.actor = null;
    },
   
    destroy: function () {
        this._onDestroy();
    }
};
