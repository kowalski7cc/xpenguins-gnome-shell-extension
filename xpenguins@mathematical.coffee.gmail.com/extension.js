const Gio      = imports.gi.Gio;
const GLib     = imports.gi.GLib;
const Gtk      = imports.gi.Gtk;
const Lang     = imports.lang;
const Mainloop = imports.mainloop;
const Pango    = imports.gi.Pango;
const St       = imports.gi.St;

const Main      = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

/* my files */
const Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
const ThemeManager = Me.themeManager.ThemeManager;
const WindowListener = Me.windowListener;
const XPenguins = Me.xpenguins;
const XPUtil = Me.util;

/* make a status button to click with options */
let _indicator, extensionPath;

function init(metadata) {
    extensionPath = metadata.path;
}

function enable() {
    _indicator = new XPenguinsMenu(extensionPath);
    Main.panel.addToStatusArea('xpenguins-menu', _indicator);
}

function disable() {
    if (_indicator) {
        // _indicator.penguinLoop.FREE/EXITNOW
        _indicator.destroy();
    }
}

//// Classes ////

/* Popup dialog with scrollable text.
 * See InstallExtensionDialog in extensionSystem.js for an example.
 * FIXME:  styles for title, icon, ...
 */
function AboutDialog() {
    this._init.apply(this, arguments);
}

AboutDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function (title, text) {
        ModalDialog.ModalDialog.prototype._init.call(this, {styleClass: 'modal-dialog'});

        let monitor = global.screen.get_monitor_geometry(global.screen.get_primary_monitor()),
            width   = Math.max(250, Math.round(monitor.width / 4)),
            height  = Math.max(400, Math.round(monitor.height / 2.5));

        /* title */
        this.title = new St.Label({text: title || '', style_class: 'xpenguins-about-title'});
        this.contentLayout.add(this.title, {x_fill: false, x_align: St.Align.MIDDLE});

        /* scroll box */
        this.scrollBox = new St.ScrollView({
            x_fill: true,
            y_fill: true,
            width: width,
            height: height
        });
        // automatic horizontal scrolling, automatic vertical scrolling
        this.scrollBox.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);

        /* text in scrollbox. For some reason it won't display unless in a St.BoxLayout. */
        this.text = new St.Label({text: (text || ''), style_class: 'xpenguins-about-text'});
        this.text.clutter_text.ellipsize = Pango.EllipsizeMode.NONE; // allows scrolling
        //this.text.clutter_text.line_wrap = true;

        this.box = new St.BoxLayout();
        this.box.add(this.text, { expand: true });
        this.scrollBox.add_actor(this.box, {expand: true, x_fill: true, y_fill: true});
        this.contentLayout.add(this.scrollBox, {expand: true, x_fill: true, y_fill: true});

        /* OK button */
        this.setButtons([{ 
            label: _("OK"),
            action: Lang.bind(this, function () {this.close(global.get_current_time()); })
        }]);
	},

    setTitle: function (title) {
        this.title.text = title;
    },

    setText: function (text) {
        this.text.text = text;
    },

    appendText: function (text, sep) {
        this.text.text += (sep || '\n') + text;
    }
};


function ThemeMenuItem() {
    this._init.apply(this, arguments);
}

ThemeMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (text, state, icon_path, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
        /* NOTE: if I just use this.addActor there's heaps of space between all the items,
         * regardless of setting this.actor's spacing or padding to 0, same with constituent items.
         * So currently using this.box  and this.box.add.
         */
        this.actor.set_style('padding-top: 0px; padding-bottom: 0px');
        this.box = new St.BoxLayout({vertical: false});
        this.addActor(this.box, {expand: true, span: -1});

        /* Info button */
        /* Could just set style-class with background-image... */
        this.button = new St.Button();
        let icon = new St.Icon({
            icon_name: 'help-contents',
            style_class: 'popup-menu-icon',
            icon_type: St.IconType.FULLCOLOR
        });
        this.button.set_child(icon);
        this.box.add(this.button);

        /* Icon (default no icon) */
        this.icon = new St.Icon({
            icon_name: 'image-missing', // placeholder icon
            icon_type: St.IconType.FULLCOLOR,
            style_class: 'popup-menu-icon'
        });
        this.box.add(this.icon);
        this.setIcon(icon_path);

        /* toggle. */
        this.toggle = new PopupMenu.PopupSwitchMenuItem(text, state || false);
        this.box.add(this.toggle.actor, {expand: true, align: St.Align.END});

        /* Pass through events */
        this.toggle.connect('toggled', Lang.bind(this, function () { this.emit('toggled', this.toggle.state); }));
        this.button.connect('clicked', Lang.bind(this, function () { this.emit('button-clicked'); }));

    },

    get state() { return this.toggle.state; },

    /* sets the icon from a path */
    setIcon: function (icon_path) {
        let path = icon_path ? Gio.file_new_for_path(icon_path) : null;
        if (path && path.query_exists(null)) {
            this.icon.set_gicon(new Gio.FileIcon({file: path}));
        }
    }
};

/*
 * XPenguinsMenu Object
 */
function XPenguinsMenu() {
    this._init.apply(this, arguments);
}

XPenguinsMenu.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function (extensionPath) {
        XPUtil.DEBUG('_init');
        /* Initialise */
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'emblem-favorite', 'xpenguins');
        this.setGIcon(new Gio.FileIcon({
            file: Gio.file_new_for_path(GLib.build_filenamev([extensionPath, 'penguin.png']))
        }));

        /* items */
        this._optionsMenu = null;
        this._themeMenu = null;
        this._items = {};
        this._themeInfo = {};
        this._toggles = {
            ignorePopups   : _("Ignore popups"),
            ignoreMaximised: _("Ignore maximised windows"),
            onAllWorkspaces: _("Always on visible workspace"), // <-- this is the only one
            onDesktop      : _("Run on desktop"), // not fully implemented
            blood          : _("Show blood"),
            angels         : _("Show angels"),
            squish         : _("God Mode"),
        };
        this._ABOUT_ORDER = ['name', 'date', 'artist', 'copyright',
            'license', 'maintainer', 'location', 'icon', 'comment'];
        this._THEME_STRING_LENGTH_MAX = 15;

        /* Create menus */
        this._createMenu();

        /* create an Xpenguin Loop object which stores the XPenguins program */
        this._XPenguinsLoop = new XPenguins.XPenguinsLoop(this.getConf());

        /* initialise as 'Penguins' */
        this._onChangeTheme(null, true, 'Penguins');
    },

    getConf: function () {
        let opts = {};
        for (let propName in this._toggles) {
            if (this._toggles.hasOwnProperty(propName) && this._items[propName]) {
                opts[propName] = this._items[propName].state;
            }
        }
        return opts;
    },

    changeOption: function (item, propVal, whatChanged) {
        XPUtil.DEBUG(('changeOption[ext]:' + whatChanged + ' -> ' + propVal));
        this._XPenguinsLoop.changeOption(whatChanged, propVal);
    },


    _createMenu: function () {
        XPUtil.DEBUG('_createMenu');
        let dummy;

        /* clear the menu */
        this.menu.removeAll();

        /* toggle to start xpenguins */
        this._items.start = new PopupMenu.PopupSwitchMenuItem(_("Start"), false);
        this._items.start.connect('toggled', Lang.bind(this, this._startXPenguins));
        this.menu.addMenuItem(this._items.start);

        /* theme submenu */
        this._themeMenu = new PopupMenu.PopupSubMenuMenuItem(_("Theme"));
        this.menu.addMenuItem(this._themeMenu);
        /* populate the combo box which sets the theme */
        this._populateThemeMenu();


        /* options submenu */
        this._optionsMenu = new PopupMenu.PopupSubMenuMenuItem(_("Options"));
        this.menu.addMenuItem(this._optionsMenu);

        /* Number of penguins */
        dummy = new PopupMenu.PopupMenuItem(_("Max penguins"), { reactive: false });
        this._items.nPenguinsLabel = new St.Label({ text: '-1' });
        dummy.addActor(this._items.nPenguinsLabel, { align: St.Align.END });
        this._optionsMenu.menu.addMenuItem(dummy);

        // set to default from theme that was just loaded.
        this._items.nPenguins = new PopupMenu.PopupSliderMenuItem(0);
        this._items.nPenguins.connect('value-changed', Lang.bind(this, this._nPenguinsSliderChanged));
        this._items.nPenguins.connect('drag-end', Lang.bind(this, this._onNPenguinsChanged));
        this._optionsMenu.menu.addMenuItem(this._items.nPenguins);

        /* ignore maximised, always on visible workspace, angels, blood, god mode, verbose toggles */
        let defaults = XPenguins.XPenguinsLoop.prototype.defaultOptions();
        let blacklist = XPenguins.getCompatibleOptions(true);
        for (let propName in this._toggles) {
            if (this._toggles.hasOwnProperty(propName) && !blacklist[propName]) {
                this._items[propName] = new PopupMenu.PopupSwitchMenuItem(this._toggles[propName], defaults[propName] || false);
                this._items[propName].connect('toggled', Lang.bind(this, this.changeOption, propName));
                this._optionsMenu.menu.addMenuItem(this._items[propName]);
            }
        }

        /* RecalcMode combo box: only if global.display has grab-op- events. */
        if (!blacklist.recalcMode) {
            //dummy = new PopupMenu.PopupMenuItem(_("Recalc mode"), {reactive: false});
            //this._optionsMenu.menu.addMenuItem(dummy);
            this._items.recalc = new PopupMenu.PopupComboBoxMenuItem({});
            this._optionsMenu.menu.addMenuItem(this._items.recalc);
            for (let mode in XPenguins.RECALC) {
                if (XPenguins.RECALC.hasOwnProperty(mode)) {
                    dummy = new PopupMenu.PopupMenuItem('Recalc mode: ' + mode);
                    this._items.recalc.addMenuItem(dummy, XPenguins.RECALC[mode]);
                }
            }
            this._items.recalc.setActiveItem(XPenguins.RECALC.ALWAYS);
            this._items.recalc.connect('active-item-changed',
                Lang.bind(this, function (item, id) { 
                    this.changeOption(null, id, 'recalcMode'); 
                }));
        }
    },

    _populateThemeMenu: function () {
        XPUtil.DEBUG("_populateThemeMenu");
        this._themeMenu.menu.removeAll();
        this._items.themes = {};
        let themeList = ThemeManager.listThemes();

        if (themeList.length === 0) {
            this._themeMenu.label.set_text(_("No themes found, click to reload!"));
            // FIXME: test
            this._themeMenu.connect('open', Lang.bind(this, this._populateThemeMenu));
        } else {
            this._themeInfo = ThemeManager.describeThemes(themeList, false);
            for (let i = 0; i < themeList.length; ++i) {
                let sanitised_name = ThemeManager.sanitiseThemeName(themeList[i]);
                this._items.themes[sanitised_name] = new ThemeMenuItem(_(themeList[i]), themeList[i] === 'Penguins');
                if (this._themeInfo[sanitised_name].icon) {
                    this._items.themes[sanitised_name].setIcon(this._themeInfo[sanitised_name].icon);
                }
                this._items.themes[sanitised_name].connect('toggled', Lang.bind(this, this._onChangeTheme, sanitised_name));
                this._items.themes[sanitised_name].connect('button-clicked', Lang.bind(this, this._onShowHelp, sanitised_name));
                this._themeMenu.menu.addMenuItem(this._items.themes[sanitised_name]);
            }
        }
    },

    _onShowHelp: function (button, name) {
        if (!this._themeInfo[name]) {
            this._themeInfo[name] = ThemeManager.describeThemes([name], false)[name];
        }

        /* make a popup dialogue (that needs to be dismissed), see perhaps alt-tab or panel-docklet? */
        let dialog = new AboutDialog(this._themeInfo[name].name);
        for (let i = 0; i < this._ABOUT_ORDER.length; ++i) {
            let propName = this._ABOUT_ORDER[i];
            if (this._themeInfo[name][propName]) {
                dialog.appendText('%s%s: %s'.format(
                    propName.charAt(0).toUpperCase(),
                    propName.slice(1),
                    this._themeInfo[name][propName]
                ));
            }
        }
        dialog.open(global.get_current_time());
    },

    _onChangeTheme: function (item, state, sanitised_name) {
        XPUtil.DEBUG('_onChangeTheme');

        let themeList = [];
        for (let name in this._items.themes) {
            if (this._items.themes.hasOwnProperty(name) && this._items.themes[name].state) {
                themeList.push(name);
            }
        }

        this._XPenguinsLoop.setThemes(themeList, true);

        let themeListFlat = themeList.map(function (name) {
                return _(name.replace(/ /g, '_'));
            }).reduce(function (x, y) {
                return x + ',' + y;
            });
        if (themeListFlat.length > this._THEME_STRING_LENGTH_MAX) {
            themeListFlat = themeListFlat.substr(0, this._THEME_STRING_LENGTH_MAX-3) + '...';
        }
        this._themeMenu.label.set_text(_("Theme") + ' (%s)'.format(themeListFlat));

        /* Set the label to match */
        this._items.nPenguins.setValue(this._XPenguinsLoop.options.nPenguins / XPenguins.PENGUIN_MAX);
        this._items.nPenguinsLabel.set_text(this._XPenguinsLoop.options.nPenguins.toString());
    },

    _startXPenguins: function (item, state) {
        XPUtil.DEBUG((state ? 'STARTING ' : 'STOPPING ') + 'XPenguins');

        if (state) {
            this._XPenguinsLoop.start();
        } else {
            this._XPenguinsLoop.stop();
        }
    },

    _nPenguinsSliderChanged: function (slider, value) {
        this._items.nPenguinsLabel.set_text(Math.ceil(value * XPenguins.PENGUIN_MAX).toString());
    },

    _onNPenguinsChanged: function () {
        if (this._XPenguinsLoop) {
            this._XPenguinsLoop.setNumber(parseInt(this._items.nPenguinsLabel.get_text(), 10));
        }
    }

};

