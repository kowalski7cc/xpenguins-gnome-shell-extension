const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

/* my files */
const Extension = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
const XPenguins = Extension.xpenguins; // how to get?

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

/* GNOME 3.2:
const ES = imports.ui.extensionSystem
ES.userExtensionsDir.get_path() : --> .local/share/gnome-shell/extensions

OR 
init(metadata): metadata.path
*/

/* GNOME 3.4:
const EU = imports.misc.extensionUtils
EU.userExtensionsDir.get_path() : --> .local/share/gnome-shell/extensions

EU.getCurrentExtension() --> nifty! throw an Error & parse the output
 --> object w/ '.path' & .dir
 */

/* make a status button to click with options */
let _indicator;

function init(metadata) {
}

function enable() {
    _indicator = new XPenguinsMenu();
    Main.panel.addToStatusArea('xpenguins-menu', _indicator);
}

function disable() {
    if ( _indicator ) {
        // _indicator.penguinLoop.FREE/EXITNOW
        _indicator.destroy();
    }
}

/*
 * XPenguinsMenu Object
 * Should I have a Menu + XPenguins object (separating display/UI from function)
 *  (but requires a bit of code duplication to pass on parameters)
 *
 * OR a combined object (cleaner code)?
 */
function XPenguinsMenu() {
    this._init.apply(this, arguments);
}

XPenguinsMenu.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function() {
        /* Initialise */
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'emblem-favorite');
    
        /* items */ 
        this._optionsMenu = null;
        this._nPenguinsItem = null;
        //this._verboseItem = null;
        //this._ignoreMaximisedItem = null;
        //this._onAllWorkspacesItem = null;
        this._items = {};
        this._toggles = { 
                         ignorePopups   : _('Ignore popups'),
                         ignoreMaximised: _('Ignore maximised windows'),
                         onAllWorkspaces: _('Always on visible workspace'), // <-- this is the only one
                         blood          : _('Show blood'),
                         angels         : _('Show angels'),
                         squish         : _('God Mode'),
                         DEBUG          : _('Verbose')
        }

        /* variables */  
        // this._DEBUG & this._PENGUIN_MAX: just store as UI elements?
        //this._DEBUG = true;
        this._PENGUIN_MAX = 256;
        //this._nPenguins = 20;
        //this._ignoreMaximised = true;


        /* connect events */

        /* Create menus */
        this._createMenu();
    },

    _createMenu: function() {
        let item;

        /* clear the menu */
    	this.menu.removeAll();

        /* toggle to start xpenguins */
        item = new PopupMenu.PopupSwitchMenuItem( _('Start'), false );
        item.connect('toggled', Lang.bind( this, this._startXPenguins ));
        this.menu.addMenuItem(item);

        /* Options menu:
         * - theme chooser  --> ComboMenuItem (not 3.2 ?)
         * + npenguins (??)              --> + 'choose default set by theme'!
         * + ignore maximised windows
         * + always on visible workspace
         * + god mode
         * + angels
         * + blood
         * + verbose toggle
         * - choose window to run in
         */

        // NOTE: I don't think I need the 'Options' submenu here?
        this._optionsMenu = new PopupMenu.PopupSubMenuMenuItem(_('Options'));
        this.menu.addMenuItem(this._optionsMenu);

        /* DEBUG/VERBOSE toggle. */
        this._verboseItem = new PopupMenu.PopupSwitchMenuItem( _('Verbose'), true);
        this._verboseItem.connect('toggled', Lang.bind( this, function() {
            // TODO
        }));
        this._optionsMenu.menu.addMenuItem(this._verboseItem);

        /* Number of penguins */
        item = new PopupMenu.PopupMenuItem(_('Max penguins'), { reactive: false });
        this._nPenguinsLabel = new St.Label({ text: this._nPenguins.toString() });
        item.addActor(this._nPenguinsLabel, { align: St.Align.END });
        this._optionsMenu.menu.addMenuItem(item);

        this._nPenguinsItem = new PopupMenu.PopupSliderMenuItem(20/this._PENGUIN_MAX);
        this._nPenguinsItem.connect('value-changed', Lang.bind(this, this._nPenguinsSliderChanged));
        this._nPenguinsItem.connect('drag-end', Lang.bind(this, this.stub));
        this._optionsMenu.menu.addMenuItem(this._nPenguinsItem);

        /* always on visible workspace toggle 
        this._onAllWorkspacesItem = new PopupMenu.PopupSwitchMenuItem(_('Always on visible workspace'), false);
        this._onAllWorkspacesItem.connect('toggled', Lang.bind(this, this.stub));
        this._optionsMenu.menu.addMenuItem(this._onAllWorkspacesItem);
        */

        /* Ignore maximised toggle 
        this._ignoreMaximisedItem = new PopupMenu.PopupSwitchMenuItem(_('Ignore maximised windows'), true));
        this._ignoreMaximisedItem.connect('toggled', Lang.bind(this, this.stub));
        this._optionsMenu.menu.addMenuItem(this._ignoreMaximisedItem);
        */

        /* God mode */
        /* Angels */
        /* Blood */
        let defaults = XPenguins.XPenguinsLoop.prototype.defaultOptions();
        for ( let propName in this._toggles ) {
            this._items[propName].push(new PopupMenu.PopupSwitchMenuItem(this._toggles[propName], defaults[propName]));
            this._items[propName].connect('toggled', Lang.bind(this, function() { this.confChanged(propName); })); // TODO: how to curry better?
            this._optionsMenu.menu.addMenuItem(this._items[propName]); 
        }

        /* create an Xpenguin Loop object which stores the XPenguins program */
        this.XPenguinsLoop = new XPenguins.XPenguinsLoop({ verbose: this._verboseItem.state,
                                                           nPenguins: parseInt(this._nPenguinsLabel.text),
                                                           ignoreMaximised: this._ignoreMaximisedItem.state 
        });
    },

        // BIG TODO: onAllWorkspaces only applies for on the desktop toons.
    confChanged: function(whatChanged) {
        if ( !this.XPenguinsLoop.is_playing() ) {
            this.XPenguinsLoop.options[whatChanged] = this._items[whatChanged].state;
        } else {
            /* TODO: send to XPenguins.loop */
        }
    },
    
    stub: function() {
        /* handles configuration changes */
    },

    _startXPenguins: function() {
    },
    _nPenguinsSliderChanged: function(slider, value) {
        this._nPenguinsLabel.set_text( Math.ceil( value*this._PENGUIN_MAX ).toString() );
    },
};

