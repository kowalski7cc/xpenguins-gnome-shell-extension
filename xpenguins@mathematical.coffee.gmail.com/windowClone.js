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
        this._onAllWorkspaces = onAllWorkspaces;
        this._startingWorkspace = global.screen.get_active_workspace();
        this.actor._delegate = this;

        if (this.actor instanceof Meta.WindowActor) {
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
            this.get_workspace = Lang.bind(this, function () {
                if (this._onAllWorkspaces) {
                    return global.screen.get_active_workspace();
                } else {
                    return this._startingWorkspace;
                }
            });
        }

        this.refresh();
    },

    /** refreshes the functions to be in sync (in particular, update the starting
     *  workspace in the case of the baseWindow being the desktop & us remaining
     *  on the starting workspace).
     **/
    refresh: function () {
        this._startingWorkspace = global.screen.get_active_workspace();
    },

    setOnAllWorkspaces: function (val) {
        this._onAllWorkspaces = val;
        if (!val) {
            this._startingWorkspace = global.screen.get_active_workspace();
        }
    },

    getOnAllWorkspaces: function () {
        return this._onAllWorkspaces;
    },

    _onDestroy: function () {
        /* remove references */
        this.meta_window = null;
        if (this.actor) {
            this.actor.disconnect(this._destroyID);
            this.actor._delegate = null;
            this.actor = null;
        }
        this._destroyID = null;
    },
   
    destroy: function () {
        this._onDestroy();
    }
};
