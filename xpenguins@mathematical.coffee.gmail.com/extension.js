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
// temp until two distinct versions:
var Me;
try {
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch (err) {
    Me = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const ThemeManager = Me.themeManager;
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

function ThemeSliderMenuItem() {
    this._init.apply(this, arguments);
}

ThemeSliderMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (text, defaultVal, min, max, round, icon_path, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        /* set up properties */
        this.min = min || 0;
        this.max = max || 1;
        this.round = round || false;
        this._value = defaultVal;
        if (round) {
           this._value = Math.round(this._value);
        } 

        /* set up item */
        this.box = new St.BoxLayout({vertical: true, name: 'xpenguins'});
        this.addActor(this.box, {expand: true, span: -1});

        this.topBox = new St.BoxLayout({vertical: false, style_class: 'theme-slider-menu-item-top-box'});
        this.topBox.add_style_class_name('theme-slider-menu-item-top-box');
        this.topBox.set_style('padding-left: 0em; padding-right: 1.75em'); /* workaround: can't get stylesheet.css to work */
        this.box.add(this.topBox, {x_fill: true});
        this.bottomBox = new St.BoxLayout({vertical: false, style_class: 'theme-slider-menu-item-bottom-box'});
        this.bottomBox.set_style('padding: 0px'); /* workaround: can't get stylesheet.css to work */
        this.box.add(this.bottomBox, {x_fill: true});

        /* Icon (default no icon) */
        this.icon = new St.Icon({
            icon_name: 'image-missing', // placeholder icon
            icon_type: St.IconType.FULLCOLOR,
            style_class: 'popup-menu-icon'
        });
        //this.icon.set_style('icon-size: 1.14em; background-color: #333333');
        this.setIcon(icon_path);

        /* text */
        this.label = new St.Label({text: text, reactive: false});
        this.label.set_style('padding-left: 0.5em');

        /* number */
        this.numberLabel = new St.Label({text: this._value.toString(), reactive: false});

        /* Info button */
        this.button = new St.Button();
        let icon = new St.Icon({
            icon_name: 'help-contents',
            style_class: 'popup-menu-icon',
            icon_type: St.IconType.FULLCOLOR
        });
        this.button.set_child(icon);

        /* slider */
        this.slider = new PopupMenu.PopupSliderMenuItem((defaultVal - min) / (max - min)); // between 0 and 1
        this.slider.actor.set_style('padding-left: 0.5em; padding-right: 0em');
       
        /* connect up signals */
        this.slider.connect('value-changed', Lang.bind(this, this._updateValue));
        /* pass through the drag-end, clicked signal */
        this.slider.connect('drag-end', Lang.bind(this, function () { this.emit('drag-end', this._value); }));
        this.button.connect('clicked', Lang.bind(this, function () { this.emit('button-clicked'); }));

        /* assemble the item */
        this.topBox.add(this.icon);
        this.topBox.add(this.label, {expand: true});
        this.topBox.add(this.numberLabel, {align: St.Align.END});
        this.bottomBox.add(this.button);
        this.bottomBox.add(this.slider.actor, {expand: true, span: -1});

        /* debugging. */
        /*
        this.label.set_style('border:1px solid #00ffff');
        this.numberLabel.set_style('border:1px solid #ffff00');
        this.icon.set_style('border: 1px solid #ffffff');
        this.button.set_style('border: 1px solid #ffffff');
        this.slider.actor.set_style('border: 1px solid #ffffff; padding-left: 0px; padding-right: 0px');
        this.box.set_style('border: 1px solid #ffff00');
        this.topBox.set_style('border: 1px solid #00ff00; padding: 0px');
        this.bottomBox.set_style('border: 1px solid #0000ff; padding: 0px');
        this.actor.set_style('border: 1px solid #ff0000; padding-top: 0px; padding-bottom: 0px');
        */
    },

    /* hope that this.slider.value and this._value remain in sync... */
    getValue: function (raw) {
        if (raw) {
            return this.slider.value;
        } else {
            return this._value;
        }
    },

    _updateValue: function (slider, value) {
        let val = value * (this.max - this.min) + this.min;
        if (this.round) {
            val = Math.round(val);
        }
        this._value = val;
        this.numberLabel.set_text(val.toString());
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
            windowPreview  : _("Window Preview"),
        };
        this._ABOUT_ORDER = ['name', 'date', 'artist', 'copyright',
            'license', 'maintainer', 'location', 'icon', 'comment'];
        this._THEME_STRING_LENGTH_MAX = 15;

        /* Create menus */
        this._createMenu();

        /* create an Xpenguin Loop object which stores the XPenguins program */
        this._XPenguinsLoop = new XPenguins.XPenguinsLoop(this.getConf());

        /* @@ debugging windowListener */
        this._windowListener = new WindowListener.WindowListener();

        /* initialise as 'Penguins' */
        /* by default, just Penguins is set */
        if (this._items.themes['Penguins']) {
            this._onChangeTheme(this._items.themes['Penguins'], -1, 'Penguins');
        }
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
        if (this._windowListener) {
            this._windowListener.changeOption(whatChanged, propVal);
        }
        this._XPenguinsLoop.changeOption(whatChanged, propVal);

        /* start/stop the windowListener */
        if (whatChanged === 'windowPreview' && this._XPenguinsLoop.is_playing()) {
            if (propVal) {
                this._windowListener.start();
            } else {
                this._windowListener.stop();
            }
        }
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
        // remove windowPreview code in release branches
        blacklist.windowPreview = true;
        defaults.windowPreview = false;
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
                this._items.themes[sanitised_name] = new ThemeSliderMenuItem(
                    _(themeList[i]), 0, 0, XPenguins.PENGUIN_MAX, true,
                    this._themeInfo[sanitised_name].icon);
                this._items.themes[sanitised_name].connect('drag-end', Lang.bind(this, this._onChangeTheme, sanitised_name));
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

    _onChangeTheme: function (item, value, sanitised_name) {
        XPUtil.DEBUG('_onChangeTheme: ' + sanitised_name);

        this._XPenguinsLoop.setThemeNumbers(sanitised_name, value);
        // UPTO: set labels.
        let themeListFlat = this._XPenguinsLoop.themeList.map(
            function (name) {
                return ThemeManager.prettyThemeName(name);
            }).reduce(function (x, y) {
                return x + ',' + y;
            });
        if (themeListFlat.length > this._THEME_STRING_LENGTH_MAX) {
            themeListFlat = themeListFlat.substr(0, this._THEME_STRING_LENGTH_MAX-3) + '...';
        }
        this._themeMenu.label.set_text(_("Theme") + ' (%s)'.format(themeListFlat));
    },

    _startXPenguins: function (item, state) {
        XPUtil.DEBUG((state ? 'STARTING ' : 'STOPPING ') + 'XPenguins');

        if (state) {
            this._XPenguinsLoop.start();
            if (this._items.windowPreview && this._items.windowPreview.state) {
                this._windowListener.start();
            }
        } else {
            this._XPenguinsLoop.stop();
            if (this._items.windowPreview && this._items.windowPreview.state) {
                this._windowListener.stop();
            }
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

