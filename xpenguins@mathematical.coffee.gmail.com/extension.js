const Lang     = imports.lang;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const St    = imports.gi.St;

const Main      = imports.ui.main;
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



/* make a status button to click with options */
let _indicator;

function init(metadata) {
}

function enable() {
    log('ENABLE');
    _indicator = new XPenguinsMenu();
    Main.panel.addToStatusArea('xpenguins-menu', _indicator);
    log('ENABLED');
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
        log('_init');
        /* Initialise */
        // TODO: change icon to something else like tux. (applications-games ?)
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

        /* create an Xpenguin Loop object which stores the XPenguins program */
        let opts = this.getConf(); 
        log('XPenguinsLoop');
        this.XPenguinsLoop = new XPenguins.XPenguinsLoop( this.getConf() );

        /* debugging windowListener */
        log('windowListener');
        this.windowListener = new WindowListener.WindowListener();

        /* connect events */

        /* Create menus */
        this._createMenu();

    },

    get DEBUG(): {
        if ( this._items && this._items.DEBUG ) {
            return this._items.DEBUG.state;
        }
        return false;
    },

    getConf: function() { 
        let opts = {};
        for ( let propName in this._toggles ) {
            opts[propName] = this._items[propName].state;
        }
        return opts;
    },

    // BIG TODO: onAllWorkspaces only applies for on the desktop toons.
    changeOption: function(whatChanged, propVal) {
        log(('changeOption[ext]:' + whatChanged + ' -> ' + propVal));
        this.windowListener.changeOption(whatChanged, propVal);
        this.XPenguinsLoop.changeOption(whatChanged, propVal);

        /* start/stop the windowListener */
        if ( whatChanged == 'DEBUG' && this.XPenguinsLoop.is_playing() ) {
            if ( propVal ) {
                this.windowListener.start();
            } else {
                this.windowListener.stop();
            }
        }
    },
    

    _createMenu: function() {
        log('_createMenu');
        let dummy;

        /* clear the menu */
    	this.menu.removeAll();

        /* toggle to start xpenguins */
        this._items.start = new PopupMenu.PopupSwitchMenuItem( _('Start'), false );
        this._items.start.connect('toggled', Lang.bind( this, this._startXPenguins ));
        this.menu.addMenuItem(this._items.start);

        /* Options menu:
         * + theme chooser
         * advanced theme chooser (checkboxes + info button + select multiple)
         * + npenguins (??)              --> + TODO 'choose default set by theme'!
         * + ignore maximised windows
         * + always on visible workspace
         * + god mode
         * + angels
         * + blood
         * + verbose toggle
         * - choose window to run in
         * - RECALC mode
         */

        log('optionsMenu');
        // NOTE: I don't think I need the 'Options' submenu here?
        this._optionsMenu = new PopupMenu.PopupSubMenuMenuItem(_('Options'));
        this.menu.addMenuItem(this._optionsMenu);

        /* theme combo box */
        // FIXME: multiple themes --> check box?.
        log('theme combo box');
        dummy = new PopupMenu.PopupMenuItem(_('Theme'), {reactive: false});
        this._optionsMenu.menu.addMenuItem(dummy);
        this._items.theme = new PopupMenu.PopupComboBoxMenuItem({});
        // TODO (future): show theme icon next to theme name (see IMStatusIcon)
        this._optionsMenu.menu.addMenuItem(this._items.theme);

        /* Number of penguins */ 
        dummy = new PopupMenu.PopupMenuItem(_('Max penguins'), { reactive: false });
        this._items.nPenguinsLabel = new St.Label({ text: '-1' });
        dummy.addActor(this._items.nPenguinsLabel, { align: St.Align.END });
        this._optionsMenu.menu.addMenuItem(dummy);

        // set to default from theme that was just loaded.
        this._items.nPenguins = new PopupMenu.PopupSliderMenuItem(0);
        this._items.nPenguins.connect('value-changed', Lang.bind(this, this._nPenguinsSliderChanged));
        this._items.nPenguins.connect('drag-end', Lang.bind(this, this.stub)); // TODO: SEND TO LOOP
        this._optionsMenu.menu.addMenuItem(this._items.nPenguins);

        /* ignore maximised, always on visible workspace, angels, blood, god mode, verbose toggles */
        let defaults = XPenguins.XPenguinsLoop.prototype.defaultOptions(); 
        for (let propName in this._toggles) {
            this._items[propName] = new PopupMenu.PopupSwitchMenuItem(this._toggles[propName], defaults[propName]);
            let p = propName; // according to gnome-shell mailing list this
                              // the only way to get the callback to work properly
            this._items[propName].connect('toggled', Lang.bind(this, function() { this.changeOption(p, this._items[p].state); }));
            this._optionsMenu.menu.addMenuItem(this._items[propName]); 
        }

        /* TODO: "Resize behaviour": {calculate on resize, calculate on resize-end, pause during resize} */

        /* RecalcMode combo box */
        log('recalc combo box');
        dummy = new PopupMenu.PopupMenuItem(_('Recalc mode'), {reactive: false});
        this._optionsMenu.menu.addMenuItem(dummy);
        this._items.recalc = new PopupMenu.PopupComboBoxMenuItem({});
        this._optionsMenu.menu.addMenuItem(this._items.recalc);
        for (let mode in XPenguins.RECALC) {
            dummy = new PopupMenu.PopupMenuItem(mode);
            this._items.recalc.addMenuItem(dummy, XPenguins.RECALC[mode]);
            this._items.recalc.connect('active-item-changed', 
                                      Lang.bind(this, this.stub)); // TODO
        }
        this._items.recalc.setActiveItem(XPenguins.RECALC.ALWAYS);
        this._items.recalc.connect('active-item-changed', 
                                  Lang.bind(this, function(item, id) { this.changeOption('recalcMode', id); }));

        /* populate the combo box which sets the theme */
        this._populateThemeComboBox();
        /* set the slider equal to default penguins */
        this.items.nPenguins.setValue(this.XPenguinsLoop.options.nPenguins/XPenguins.PENGUIN_MAX);
        this._items.nPenguinsLabel.set_text( this.XPenguinsLoop.options.nPenguins.toString() );
    },

    _populateThemeComboBox: function() {
        log('_populateThemeComboBox');
        this._items.theme._menu.removeAll();
        let themeList = ThemeManager.list_themes();
        let dummy;
        if ( themeList.length == 0 ) {
           dummy = new PopupMenu.PopupMenuItem(_('No themes found, click to reload!'), {reactive: false});
           this._items.theme.addMenuItem(dummy);
           this._items.theme._menu.connect('open-state-changed', 
                                     Lang.bind(this, function(act, open) {
                                         if ( open )
                                             this._populateThemeComboBox();
                                     }));
           this._items.theme.setActiveItem(0);
        } else {
            /*
             * look up icon..
             * //UPTO: theme_manager.get_icon(_path)
             * dummy = new ThemeMenuItem(text, themeList[i]=='Penguins', icon_path);
             */
            for ( let i=0; i<themeList.length; ++i ) {
                dummy = new PopupMenu.PopupMenuItem(_(themeList[i]));
                /* replace space with undescore for directory name */
                dummy.theme_name = themeList[i].replace(/ /g,'_');
                this._items.theme.addMenuItem(dummy);
            }
            this._items.theme.connect('active-item-changed', 
                                      Lang.bind(this, this._onChangeTheme)); 
            /* set active theme */
            dummy = themeList.indexOf('Penguins') || 0;
            this._items.theme.setActiveItem(dummy);
            this._onChangeTheme(this._items.theme, dummy);
        }
    },

    stub: function() {
        /* handles configuration changes */
    },

    _onChangeTheme: function(combo, id) {
        // TODO: better way to get the label text ???
        // id is the position of the theme.
        // update the nPenguins slider.
        log(('changing theme to '+ combo._items[id].theme_name));
        /* set total penguins to default for the theme(s) */
        this.XPenguinsLoop.set_themes( combo._items[id].theme_name, true );
    },

    _startXPenguins: function(item, state) {
        if ( state == this.XPenguinsLoop.is_playing() ) return;

        // temporary
        if ( state ) {
            this.XPenguinsLoop.start();
            if ( this.DEBUG ) 
                this.windowListener.start();
        } else {
            this.XPenguinsLoop.stop();
            if ( this.DEBUG ) 
                this.windowListener.stop();
        }
    },

    _nPenguinsSliderChanged: function(slider, value) {
        this._items.nPenguinsLabel.set_text( Math.ceil( value*XPenguins.PENGUIN_MAX ).toString() );
    },
};

function ThemeMenuItem() {
    this._init.apply(this, arguments);
};

ThemeMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(text, state, icon_path, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        this.box = new St.BoxLayout({vertical: false});
        this.addActor(box, {span: -1});

        /* Info button */
        /* Could just set style-class with background-image... */
        this.button = new St.Button();
        let icon = new St.Icon({ icon_name: 'help-about',
                                 style_class:'system-status-icon'
        });
        this.button.set_child(icon);
        this.box.addActor(button);

        /* Icon (default no icon) */
        let path = icon_path && Gio.file_new_for_path(icon_path) || null;
        this.icon = new St.Icon({ 
                                  gicon: new Gio.FileIcon({file: path}),
                                  icon_type: St.IconType.FULLCOLOUR,
                                  style_class: 'system-status-icon'
        });
        this.box.addActor(icon);
       
        /* toggle. TODO: should it really be embedded into a PopupBaseMenuItem? */ 
        this.toggle = new PopupMenu.PopupSwitchMenuItem(text, state);
        this.box.addActor(this.toggle, {span: -1});
        // COULD DO
        // this.toggle = new St.Button();
        // this.toggle.set_toggle_mode(true);
        // Then on toggle, change pic to square vs filled square?
        // Hmm, then could just .addActor everything, I think.
    },
};
