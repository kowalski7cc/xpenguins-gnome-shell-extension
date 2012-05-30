const Lang     = imports.lang;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const St    = imports.gi.St;

const Main      = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

/* my files */
// temp until two distinct versions:
var Me;
try {
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch(err) {
    Me = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const XPenguins = Me.xpenguins; 
const WindowListener = Me.windowListener;
const ThemeManager = Me.theme_manager.ThemeManager;
const XPUtil = Me.util;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;



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

    log: function() {
        if ( !this._items || !this._items.DEBUG || this._items.DEBUG.state ) {
            XPUtil.LOG.apply(this,arguments);
        }
    },

    _init: function() {
        this.log('_init');
        /* Initialise */
        // TODO: change icon to something else like tux. (applications-games ?)
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'emblem-favorite');
    
        /* items */ 
        this._optionsMenu = null;
        this._themeMenu = null;
        this._items = {};
        this._themeInfo = {};
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

        /* Create menus */
        this._createMenu();

        /* create an Xpenguin Loop object which stores the XPenguins program */
        this.log('XPenguinsLoop');
        this.XPenguinsLoop = new XPenguins.XPenguinsLoop( this.getConf() );

        /* debugging windowListener */
        this.log('windowListener');
        this.windowListener = new WindowListener.WindowListener();

        /* initialise as 'Penguins' */
        this._onChangeTheme(null, null, 'Penguins');
    },

    get DEBUG() {
        if ( this._items.DEBUG ) {
            return this._items.DEBUG.state;
        }
        return false;
    },

    getConf: function() { 
        let opts = {};
        for ( let propName in this._toggles ) {
            if ( this._items[propName] ) {
                opts[propName] = this._items[propName].state;
            }
        }
        return opts;
    },

    // BIG TODO: onAllWorkspaces only applies for on the desktop toons.
    changeOption: function(item, propVal, whatChanged) {
        this.log(('changeOption[ext]:' + whatChanged + ' -> ' + propVal));
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
        this.log('_createMenu');
        let dummy;

        /* clear the menu */
    	this.menu.removeAll();

        /* toggle to start xpenguins */
        this._items.start = new PopupMenu.PopupSwitchMenuItem( _('Start'), false );
        this._items.start.connect('toggled', Lang.bind( this, this._startXPenguins ));
        this.menu.addMenuItem(this._items.start);

        /* theme submenu */
        this.log('theme submenu');
        this._themeMenu = new PopupMenu.PopupSubMenuMenuItem(_('Theme'));
        this.menu.addMenuItem(this._themeMenu);
        /* populate the combo box which sets the theme */
        this._populateThemeMenu();


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

        this.log('optionsMenu');
        // NOTE: I don't think I need the 'Options' submenu here?
        this._optionsMenu = new PopupMenu.PopupSubMenuMenuItem(_('Options'));
        this.menu.addMenuItem(this._optionsMenu);


        /* Number of penguins */ 
        dummy = new PopupMenu.PopupMenuItem(_('Max penguins'), { reactive: false });
        this._items.nPenguinsLabel = new St.Label({ text: '-1' });
        dummy.addActor(this._items.nPenguinsLabel, { align: St.Align.END });
        this._optionsMenu.menu.addMenuItem(dummy);

        // set to default from theme that was just loaded.
        this._items.nPenguins = new PopupMenu.PopupSliderMenuItem(0);
        this._items.nPenguins.connect('value-changed', Lang.bind(this, this._nPenguinsSliderChanged));
        this._items.nPenguins.connect('drag-end', Lang.bind(this, this._onNPenguinsChanged)); // TODO: SEND TO LOOP
        this._optionsMenu.menu.addMenuItem(this._items.nPenguins);

        /* ignore maximised, always on visible workspace, angels, blood, god mode, verbose toggles */
        let defaults = XPenguins.XPenguinsLoop.prototype.defaultOptions(); 
        for (let propName in this._toggles) {
            this._items[propName] = new PopupMenu.PopupSwitchMenuItem(this._toggles[propName], defaults[propName]);
            //let p = propName; // according to gnome-shell mailing list this
                              // the only way to get the callback to work properly
            this._items[propName].connect('toggled', this.changeOption, propName);
            this._optionsMenu.menu.addMenuItem(this._items[propName]); 
        }

        /* TODO: "Resize behaviour": {calculate on resize, calculate on resize-end, pause during resize} */

        /* RecalcMode combo box */
        this.log('recalc combo box');
        dummy = new PopupMenu.PopupMenuItem(_('Recalc mode'), {reactive: false});
        this._optionsMenu.menu.addMenuItem(dummy);
        this._items.recalc = new PopupMenu.PopupComboBoxMenuItem({});
        this._optionsMenu.menu.addMenuItem(this._items.recalc);
        for (let mode in XPenguins.RECALC) {
            dummy = new PopupMenu.PopupMenuItem(mode);
            this._items.recalc.addMenuItem(dummy, XPenguins.RECALC[mode]);
        }
        this._items.recalc.setActiveItem(XPenguins.RECALC.ALWAYS);
        this._items.recalc.connect('active-item-changed', 
                                  Lang.bind(this, function(item, id) { this.changeOption('recalcMode', id); }));

    },

    _populateThemeMenu: function() {
        this.log('_populateThemeMenu');
        this._themeMenu.menu.removeAll();
        this._items.themes = {};
        let themeList = ThemeManager.list_themes();
        if ( themeList.length == 0 ) {
            // TODO: add new item saying 'click to reload', or just modify dropdown menu label?
            this._themeMenu.label.set_text(_('No themes found, click to reload!'));
            // FIXME: test
            this._themeMenu.connect('open', Lang.bind(this, this._populateThemeMenu));
        } else {
            /*
             * look up icon..
             * //UPTO: theme_manager.get_icon(_path)
             * dummy = new ThemeMenuItem(text, themeList[i]=='Penguins', icon_path);
             */
            for ( let i=0; i<themeList.length; ++i ) {
                let sanitised_name = themeList[i].replace(/ /g,'_');
                this._items.themes[sanitised_name] = new ThemeMenuItem(_(themeList[i]), themeList[i]=='Penguins');
                this._items.themes[sanitised_name].connect('toggled', Lang.bind(this, this._onChangeTheme));
                this._items.themes[sanitised_name].connect('button-clicked', Lang.bind(this, this._onShowHelp, sanitised_name));
                this._themeMenu.menu.addMenuItem(this._items.themes[sanitised_name]);
            }
            this._themeinfo = ThemeManager.describe_themes(themeList, false);
        }
/*
 * FIXME: Prefer checkbox in ThemeMenuItem2 ? (add as St.Button)
        let dummy;
        dummy = new ThemeMenuItem('Test theme', false);
        this.menu.addMenuItem(dummy);
        dummy = new ThemeMenuItem2('Test theme', false);
        this.menu.addMenuItem(dummy);
        // set_icon.
 */
    },

    // UPTO
    _onShowHelp: function(button, name) {
        this.log(('showing help for ' + name));
        if ( !this._themeinfo[name] ) {
            this._themeinfo[name] = ThemeManager.describe_themes([name], false)[name];
        }
        for ( let propName in this._themeinfo[name] ) {
            this.log('%s: %s', propName, this._themeinfo[name][propName]);
        }
        /* make a popup dialogue (that needs to be dismissed), see perhaps alt-tab or panel-docklet?
    },

    _onChangeTheme: function() {
        this.log('_onChangeTheme');

        let themeList = [];
        /* THIS IS ALWAYS TURNING OUT 0 */
        for ( let name in this._items.themes ) {
            if ( this._items.themes[name].state )
                themeList.push(name);
        }

        this.XPenguinsLoop.set_themes( themeList, true );

        // FIXME: JSON.stringify?
        let themeListFlat = themeList.map(function(name) { 
                                            return _(name.replace(/ /g,'_'));
                                          }).reduce(function(x, y) {
                                              return x+','+y;
                                          });
        // FIXME: truncate to '...'
        this._themeMenu.label.set_text(_('Theme') + ' (%s)'.format(themeListFlat));

        /* Set the label to match */
        this._items.nPenguins.setValue(this.XPenguinsLoop.options.nPenguins/XPenguins.PENGUIN_MAX);
        this._items.nPenguinsLabel.set_text( this.XPenguinsLoop.options.nPenguins.toString() );
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

    _onNPenguinsChanged: function() {
        /* will have to set terminate sequence for the others.
         * Like load averaging.
         * TODO: test.
         */
        if ( this.XPenguinsLoop ) {
            this.XPenguinsLoop.set_number(parseInt(this._items.nPenguinsLabel.get_text()));
        }
    },

};

function ThemeMenuItem2() {
    this._init.apply(this, arguments);
};

ThemeMenuItem2.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(text, state, icon_path, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this);
        /* FIXME: if I just use this.addActor there's heaps of space between all the items,
         * regardless of setting this.actor's spacing or padding to 0, same with constituent items.
         * So currently using this.box  and this.box.add.
         */
        this.box = new St.BoxLayout({vertical: false});
        this.addActor(this.box, {expand: true, span: -1});


        /* icon */
        this.icon = new St.Icon({ 
                                  icon_name: 'image-missing', //placeholder
                                  icon_type: St.IconType.FULLCOLOR,
                                  style_class: 'popup-menu-icon'
        });
        this.box.add(this.icon); 

        /* label */ 
        this.label = new St.Label({text: text}); // reactive: false?
        this.box.add(this.label, {expand: true, align: St.Align.START});

        /* info button */
        this.button = new St.Button();
        let icon = new St.Icon({ icon_name: 'help-contents',
                                 style_class:'popup-menu-icon',
                                 // FIXME: appears not to have symbolic icon
                                 icon_type: St.IconType.FULLCOLOR

        });
        this.button.set_child(icon);
        this.box.add(this.button, {align: St.Align.END});

        /* toggle */
        this.state = state || false;
        this.setShowDot(true); /* connect up toggle event to setShowDot */
        this.connect('activate', Lang.bind(this, function() { 
            this.state = !this.state;
        }));

        /* debugging.
        this.icon.set_style('border: 1px solid #ffffff');
        this.label.set_style('border: 1px solid #ffffff');
        this.button.actor.set_style('border: 1px solid #ffffff');
        this.box.set_style('border: 1px solid #ffff00');

        NOTE: could simply style a checkbox in the same style as setShowDot.
        */

    },

    _onRepaintDot: function(area) {
        log('_onRepaintDot');
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let colour = area.get_theme_node().get_foreground_color();

        cr.setSourceRGBA (
                colour.red / 255,
                colour.green / 255,
                colour.blue / 255,
                colour.alpha / 255);
        
        /* draw box */
        // FIXME: make this a St.Button in toggle mode instead of this??
      
        cr.rectangle(0, 0, width, height);
        if ( this.state ) {
            cr.fill();
        }
        cr.stroke();
    },

};

SettingsDialog.prototype = {
	
	_init: function() {
            // just need a mainBox = St.BoxLayout({vertical: true});
            // then add to it a multi-line text and a button. that's it.
            // this.actor = mainBox = new St.BoxLayout(...)
            // mainBox.add(text); mainBox.add(closeButton);
            // no need for scrollable.
		let monitor = dock._getMonitor(),
			padding = 10,
			boxWidth = Math.round(monitor.width/1.5),
			boxHeight = Math.round(monitor.height/1.5),
		   	mainBox = this.actor = new St.BoxLayout({style_class: "panelDocklet_dialog",
				vertical: true,
				x:Math.round((monitor.width - boxWidth)/2) + monitor.x,
				y:Math.round((monitor.height - boxHeight)/2) + monitor.y,
				width: boxWidth + padding*2,
				height: boxHeight + padding*2,
			}),
            closeButton = new St.Button({style_class: 'dialog_button', label:'OK', x: boxWidth/2, y: boxHeight});
			content = new St.BoxLayout({vertical: true});
		
		mainBox.add(content); // TODO: add vs add_actor ?
        this._group = new PopupMenu.PopupComboMenu(); // what's a PopupComboMenu & why that?
        content.add(this._group.actor);
		
		closeButton.connect("button-release-event", Lang.bind(this, this.close));
		mainBox.add(closeButton);
	
        /* add to UI */    
		Main.uiGroup.add_actor(mainBox);
		
		Main.pushModal(this.actor);

        // to make stuff:
        // this._createSwitch(...)
	},
	_createSeparator: function() {
		this._group.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
	},
	close: function() {
		Main.popModal(this.actor);
		this.actor.destroy();
		this._dock._settingsMenu = false;
	},
};

// FIXME: see panel-docklet for an example of making the switch only.
function ThemeMenuItem() {
    this._init.apply(this, arguments);
};

ThemeMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(text, state, icon_path, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
        /* FIXME: if I just use this.addActor there's heaps of space between all the items,
         * regardless of setting this.actor's spacing or padding to 0, same with constituent items.
         * So currently using this.box  and this.box.add.
         */
        this.box = new St.BoxLayout({vertical: false});
        this.addActor(this.box, {expand: true, span: -1}); 
        // FIXME: should the toggles be all the way to the right like that?? various padding-right settings seem not to have effect.
        
        /* Info button */
        /* Could just set style-class with background-image... */
        this.button = new St.Button();
        let icon = new St.Icon({ icon_name: 'help-contents',
                                 style_class:'popup-menu-icon',
                                 // FIXME: appears not to have symbolic icon
                                 icon_type: St.IconType.FULLCOLOR

        });
        this.button.set_child(icon);
        this.box.add(this.button);

        /* Icon (default no icon) */
        this.icon = new St.Icon({ icon_name: 'image-missing', // placeholder
                                  icon_type: St.IconType.FULLCOLOR,
                                  style_class: 'popup-menu-icon'
        });
        this.box.add(this.icon);
        this.set_icon(icon_path);

        /* toggle. */ 
        this.toggle = new PopupMenu.PopupSwitchMenuItem(text, state|| false);
        this.box.add(this.toggle.actor, {expand: true, align:St.Align.END});

        /* Pass through events */
        this.toggle.connect('toggled', Lang.bind(this, function() { this.emit('toggled', this.toggle.state); }));
        this.button.connect('clicked', Lang.bind(this, function() { this.emit('button-clicked'); }));

        /* debugging.
        this.icon.set_style('border: 1px solid #ffffff');
        this.button.set_style('border: 1px solid #ffffff');
        this.toggle.actor.set_style('border: 1px solid #ffffff; padding-right: 0em');
        this.box.set_style('border: 1px solid #ffff00');
        this.actor.set_style('border: 1px solid #ff0000');
        */
    },

    get state() { return this.toggle.state; },

    /* sets the icon from a path */
    set_icon: function(icon_path) {
        let path = icon_path && Gio.file_new_for_path(icon_path) || null;
        if ( path && path.query_exists(null) ) {
            this.icon.set_gicon(new Gio.FileIcon({file: path}));
        }
    }
};
