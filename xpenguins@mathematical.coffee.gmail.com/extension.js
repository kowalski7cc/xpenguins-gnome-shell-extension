const Mainloop = imports.mainloop;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;


/* make a status button to click with options */
let _indicator;

function init(metadata) {
}

function enable() {
    _indicator = new XpenguinsMenu();
    Main.panel.addToStatusArea('xpenguins-menu', _indicator);
}

function disable() {
    if ( _indicator ) {
        _indicator.destroy();
    }
}

/*
 * XpenguinsMenu Object
 */
function XpenguinsMenu() {
    this._init.apply(this, arguments);
}

XpenguinsMenu.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _log: function(msg) {
        if ( this._DEBUG ) {
            global.log(msg);
            log(msg);
        }
    },

    _init: function() {
        /* Initialise */
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'mail-unread');
     
        /* variables */  
        this._DEBUG = true;
        this._PENGUIN_MAX = 256;

        this._nPenguins = 20;
        this._ignoreMaximised = true;

        this._optionsMenu = null;

        /* connect events */

        /* Create menus */
        this._createMenu();
    },

    _createMenu: function() {
        let item;

        /* clear the menu */
    	this.menu.removeAll();

        /* toggle to start xpenguins */
        item = new PopupMenu.PopupSwitchMenuItem( _('Xpenguins'), false );
        item.connect('toggled', Lang.bind( this, this._startXpenguins ));
        this.menu.addMenuItem(items);

        /* Options menu:
         * - theme  --> ComboMenuItem (not 3.2 ?)
         * + npenguins (??)
         * + ignore maximised windows
         * + verbose toggle
         * - choose window to run in
         */
        this._optionsMenu = new PopupMenu.PopupSubMenuMenuItem('Options');
        this.menu.addMenuItem(this._optionsMenu);

        /* DEBUG/VERBOSE toggle. */
        item = new PopupMenu.PopupSwitchMenuItem( _('Verbose'), this._DEBUG );
        item.connect('toggled', Lang.bind( this, function() {
                                            this._DEBUG = !this._DEBUG;
        }));
        this._optionsMenu.menu.addMenuItems(item);

        /* Number of penguins */
        item = new PopupMenu.PopupMenuItem(_('Max penguins'), { reactive: false });
        this._nPenguinsLabel = new St.Label({ text: this._nPenguins });
        item.addActor(this._nPenguinsLabel, { align: St.Align.END });
        this._optionsMenu.menu.addMenuItem(item);

        item = new PopupMenu.SliderMenuItem(this._nPenguins/this._PENGUIN_MAX);
        item.connect('value-changed', Lang.bind(this, this._maxPenguinsSliderChanged));
        item.connect('drag-end', Lang.bind(this, this._maxPenguinsChanged));
        this._optionsMenu.menu.addMenuItem(item);

        /* Ignore maximised toggle */
        item = new PopupMenu.PopupSwitchMenuItem( _('Ignore maximised windows'), this._ignoreMaximised );
        item.connect('toggled', Lang.bind( this, this._ignoreMaximisedWindows ));
        this._optionsMenu.menu.addMenuItems(item);
    },

    _startXpenguins: function() {
    },
    _ignoreMaximisedWindows: function() {
    },
    _maxPenguinsSliderChanged: function(slider, value) {
        this._nPenguinsLabel.set_text( Math.ceil( value*this._PENGUIN_MAX ) );
    },
    _maxPenguinsChanged: function(slider,value) {
        this._log('slider: value is ' + value );
        this._nPenguins = Math.ceil( value*this._PENGUIN_MAX );
    }
};
// ABOVE: this.xpenguinsProcess = new XpenguinsLoop(); Pipe settings to this.

