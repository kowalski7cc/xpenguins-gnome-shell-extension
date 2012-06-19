const Clutter = imports.gi.Clutter;
const Lang    = imports.lang;
const Meta    = imports.gi.Meta;
const Signals = imports.signals;

/* XPenguinsWindow.
 * Makes a Clutter.Group that shadows the window it is meant to clone, moving
 * and resizing with it.
 *
 * You add the Clutter.Group via Main.layoutManager.addChrome, and you add the
 * toons to the Clutter.Group.
 *
 * It's a bit of a polyglot depending on whether the window we clone is a
 * Meta.Window or a Clutter.Stage.
 */
// FIXME: cannot interact with window while the group is on top.
// And, the toons don't seem to be positioned relative to it?
function XPenguinsWindow() {
    this._init.apply(this, arguments);
}

XPenguinsWindow.prototype = {
    _init: function (baseWindow, onAllWorkspaces) {
        this._realWindowSignals = [];
        this.realWindow = null;
        this.meta_window = null;

        this.actor = new Clutter.Group();
        this.realWindow = baseWindow;
        this.meta_window = baseWindow.meta_window;
        this.actor._delegate = this;

        if (baseWindow instanceof Meta.WindowActor) {
            /* connect signals */
            this._realWindowSignals.push(this.realWindow.connect('position-changed',
                Lang.bind(this, this._onPositionChanged)));
            this._realWindowSignals.push(this.realWindow.connect('size-changed',
                Lang.bind(this, this._onSizeChanged)));
            this._onPositionChanged();
            this._onSizeChanged();
            this.get_workspace = Lang.bind(this.meta_window,
                this.meta_window.get_workspace);
        } else {
            this.actor.set_position(baseWindow.x, baseWindow.y);
            this.actor.set_size(baseWindow.width, baseWindow.height);
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
        this._realWindowSignals.push(this.realWindow.connect('destroy',
            Lang.bind(this, this._onDestroy)));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
        // TODO: raise to top?
    },

    // TODO: connect up *all* window signals.

    // TODO: only update every frame to make things quicker?
    /* have to use get_outer_rect() because WindowActors have padding */
    _onPositionChanged: function () {
        let rect = this.meta_window.get_outer_rect();
        this.actor.set_position(rect.x, rect.y);
    },

    _onSizeChanged: function () {
        let rect = this.meta_window.get_outer_rect();
        this.actor.set_size(rect.width, rect.height);
    },

    _disconnectRealWindowSignals: function () {
        let i = this._realWindowSignals.length;
        while (i--) {
            this.realWindow.disconnect(this._realWindowSignals[i]);
        }
        this._realWindowSignals = [];
    },

    _onDestroy: function () {
        /* disconnect signals, remove references */
        this._disconnectRealWindowSignals();
        this.actor._delegate = null;
        this.disconnectAll(); // <-- ???
    },
   
    // TODO: destroy clone on stopping xpenguins 
    destroy: function () {
        this.actor.destroy();
    },

    get_width: function () {
        return this.actor.get_width();
    },

    get_height: function () {
        return this.actor.get_height();
    },

    get_position: function () {
        return this.actor.get_position();
    },

    add_actor: function (act) {
        this.actor.add_actor(act);
    },

    remove_actor: function (act) {
        this.actor.remove_actor(act);
    }
};
Signals.addSignalMethods(XPenguinsWindow.prototype);
