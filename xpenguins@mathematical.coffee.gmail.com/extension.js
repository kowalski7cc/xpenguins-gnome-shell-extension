const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

/* my files */
// temp until two distinct versions:
var Extension;
try {
    Extension = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch(err) {
    Extension = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const XPenguins = Extension.xpenguins; 
const WindowListener = Extension.windowListener;
const ThemeManager = Extension.theme_manager.ThemeManager;

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
        this._items = {};
        this._toggles = { 
                         ignorePopups   : _('Ignore popups'),
                         ignoreMaximised: _('Ignore maximised windows'),
                         onAllWorkspaces: _('Always on visible workspace'), // <-- this is the only one
                         onDesktop      : _('Run on desktop'), // not fully implemented
                         blood          : _('Show blood'),
                         angels         : _('Show angels'),
                         squish         : _('God Mode'),
                         DEBUG          : _('Verbose')
        };

        /* variables */  
        // this._DEBUG & this._PENGUIN_MAX: just store as UI elements?
        //this._DEBUG = true;
        this._PENGUIN_MAX = 256;


        /* connect events */

        /* Create menus */
        this._createMenu();

        /* create an Xpenguin Loop object which stores the XPenguins program */
        let opts = this.getConf(); 
        // opts.nPenguins = parseInt(this._nPenguinsLabel.text); <-- by default don't do it??
        this.XPenguinsLoop = new XPenguins.XPenguinsLoop( this.getConf() );
        // TODO: load default theme ('Penguins', set n toons from that).

        this.windowListener = new WindowListener.WindowListener();
    },

    getConf: function() { 
        let opts = {};
        for ( let propName in this._toggles ) {
            opts[propName] = this._items[propName].state;
        }
        return opts;
    },

    // BIG TODO: onAllWorkspaces only applies for on the desktop toons.
    confChanged: function(whatChanged) {
        if ( !this.XPenguinsLoop.is_playing() ) {
            this.XPenguinsLoop.options[whatChanged] = this._items[whatChanged].state;
        } else {
            /* TODO: send to XPenguins.loop: signal or direct call? */
            // this.XPenguinsLoop.changeOption(whatChanged, this._items[whatChange].state);
            this.windowListener.changeOption(whatChanged, this._items[whatChange].state);
        }
    },
    

    _createMenu: function() {
        /* clear the menu */
    	this.menu.removeAll();

        /* toggle to start xpenguins */
        this._items.start = new PopupMenu.PopupSwitchMenuItem( _('Start'), false );
        this._items.start.connect('toggled', Lang.bind( this, this._startXPenguins ));
        this.menu.addMenuItem(this._items.start);

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

        /* theme combo box */
        this._items.theme = new PopupMenu.PopupComboBoxMenuItem();
        this._populateThemeComboBox();
        // TODO (future): show theme icon next to theme name (see IMStatusIcon)
        this._optionsMenu.menu.addMenuItem(this._items.theme);

        /* Number of penguins */ 
        let dummy = new PopupMenu.PopupMenuItem(_('Max penguins'), { reactive: false });
        this._items.nPenguinsLabel = new St.Label({ text: '-1' });
        dummy.addActor(this._items.nPenguinsLabel, { align: St.Align.END });
        this._optionsMenu.menu.addMenuItem(dummy);

        this._items.nPenguins = new PopupMenu.PopupSliderMenuItem(20/this._PENGUIN_MAX);
        this._items.nPenguins.connect('value-changed', Lang.bind(this, this._nPenguinsSliderChanged));
        this._items.nPenguins.connect('drag-end', Lang.bind(this, this.stub)); // TODO: SEND TO LOOP
        this._optionsMenu.menu.addMenuItem(this._items.nPenguins);

        /* ignore maximised, always on visible workspace, angels, blood, god mode, verbose toggles */
        // ERROR HERE.
        // XPenguins is undefined.
        let defaults = XPenguins.XPenguinsLoop.prototype.defaultOptions(); 
        for ( let propName in this._toggles ) {
            this._items[propName] = new PopupMenu.PopupSwitchMenuItem(this._toggles[propName], defaults[propName]);
            this._items[propName].connect('toggled', Lang.bind(this, function() { this.confChanged(propName); })); // TODO: how to curry better?
            this._optionsMenu.menu.addMenuItem(this._items[propName]); 
        }

        /* TODO: "Resize behaviour": {calculate on resize, calculate on resize-end, pause during resize} */


    },

    _populateThemeComboBox: function() {
        this._items.theme._menu.removeAll();
        let themeList = ThemeManager.list_themes();
        let dummy;
        if ( themeList.length == 0 ) {
           dummy = new PopupMenu.PopupMenuItem(_('No themes found, click to reload!'), {reactive: false});
           this._items.theme.addMenuItem(dummy);
           // TODO: ativate item or item-changed ???
           this._items.theme.connect('active-item-changed', 
                                     Lang.bind(this, this._populateThemeComboBox));
        } else {
            for ( let i=0; i<themeList.length; ++i ) {
                dummy = new PopupMenu.PopupMenuItem(_(themeList[i]));
                this._items.theme.addMenuItem(dummy);
            }
            this._items.theme.connect('active-item-changed', 
                                      Lang.bind(this, this.stub)); // TODO
            this._items.theme.setActiveItem(themeList.indexOf('Penguins'));
        }
    },

    stub: function() {
        /* handles configuration changes */
    },

    _onChangeTheme: function(menuItem, id) {
        // id is the position of the theme.
    },

    _startXPenguins: function(item, state) {
        if ( state == this.windowListener.is_playing() ) return;
        // temporary
        if ( state ) {
            this.windowListener.start();
        } else {
            this.windowListener.stop();
        }
    },

    _nPenguinsSliderChanged: function(slider, value) {
        this._items.nPenguinsLabel.set_text( Math.ceil( value*this._PENGUIN_MAX ).toString() );
    },
};

