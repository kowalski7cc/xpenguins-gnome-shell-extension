const Lang     = imports.lang;
const Mainloop = imports.mainloop;
const Gio      = imports.gi.Gio;
const Gtk      = imports.gi.Gtk;
const Pango    = imports.gi.Pango;
const St       = imports.gi.St;

const Main      = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

/* my files */
// temp until two distinct versions:
var Me;
try {
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch (err) {
    Me = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const XPenguins = Me.xpenguins;
const WindowListener = Me.windowListener;
const ThemeManager = Me.theme_manager.ThemeManager;
const XPUtil = Me.util;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

/* FIXME: ThemeMenuItem2 looks a bit better?
 * FIXME: ThemeMenuItem has *way* too much vertical padding
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
    if (_indicator) {
        // _indicator.penguinLoop.FREE/EXITNOW
        _indicator.destroy();
    }
}


/* Popup dialog with scrollable text.
 * See InstallExtensionDialog in extensionSystem.js for an example.
 * FIXME: make it look better. styles for headings, show the icon, ...
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
        // fixme: define style for title.
        this.title = new St.Label({text: title || '', style: 'font-weight: bold'});
        this.contentLayout.add(this.title, { x_fill: false, x_align: St.Align.MIDDLE });

        /* scroll box */
        this.scrollBox = new St.ScrollView({
            x_fill: true,
            y_fill: true,
            width: width,
            height: height
        });
        // automatic horizontal scrolling, automatic vertical scrolling
        this.scrollBox.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);

        /* text in scrollbox. FIXME: for some reason it won't display unless in a St.BoxLayout. */
        this.text = new St.Label({text: (text || '')});
        this.text.clutter_text.ellipsize = Pango.EllipsizeMode.NONE; // allows scrolling
        //this.text.clutter_text.line_wrap = true;

        this.box = new St.BoxLayout();
        this.box.add(this.text, { expand: true });
        this.scrollBox.add_actor(this.box, {expand: true, x_fill: true, y_fill: true});
        this.contentLayout.add(this.scrollBox, {expand: true, x_fill: true, y_fill: true});

        /* OK button */
        this.setButtons([{ label: _('OK'),
                           action: Lang.bind(this, function () {this.close(global.get_current_time()); })
                        }]);
	},

    set_title: function (title) {
        this.title.text = title;
    },

    set_text: function (text) {
        this.text.text = text;
    },

    append_text: function (text, sep) {
        this.text.text += (sep || '\n') + text;
    }
};


// FIXME: see panel-docklet for an example of making the switch only.
function ThemeMenuItem() {
    this._init.apply(this, arguments);
}

ThemeMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (text, state, icon_path, params) {
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
        let icon = new St.Icon({
            icon_name: 'help-contents',
            style_class: 'popup-menu-icon',
            // FIXME: appears not to have symbolic icon
            icon_type: St.IconType.FULLCOLOR
        });
        this.button.set_child(icon);
        this.box.add(this.button);

        /* Icon (default no icon) */
        this.icon = new St.Icon({
            icon_name: 'image-missing', // placeholder
            icon_type: St.IconType.FULLCOLOR,
            style_class: 'popup-menu-icon'
        });
        this.box.add(this.icon);
        this.set_icon(icon_path);

        /* toggle. */
        this.toggle = new PopupMenu.PopupSwitchMenuItem(text, state || false);
        this.box.add(this.toggle.actor, {expand: true, align: St.Align.END});

        /* Pass through events */
        this.toggle.connect('toggled', Lang.bind(this, function () { this.emit('toggled', this.toggle.state); }));
        this.button.connect('clicked', Lang.bind(this, function () { this.emit('button-clicked'); }));

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
    set_icon: function (icon_path) {
        let path = icon_path ? Gio.file_new_for_path(icon_path) : null;
        if (path && path.query_exists(null)) {
            this.icon.set_gicon(new Gio.FileIcon({file: path}));
        }
    }
};

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

    log: function () {
        if (!this._items || !this._items.DEBUG || this._items.DEBUG.state) {
            XPUtil.LOG.apply(this, arguments);
        }
    },

    _init: function () {
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
            DEBUG          : _('Verbose'),
            windowPreview  : _('Window Preview'),
        };
        this._ABOUT_ORDER = ['name', 'date', 'artist', 'copyright',
            'license', 'maintainer', 'location', 'icon', 'comment'];

        /* Create menus */
        this._createMenu();

        /* create an Xpenguin Loop object which stores the XPenguins program */
        this.XPenguinsLoop = new XPenguins.XPenguinsLoop(this.getConf());

        /* @@ debugging windowListener */
        this.windowListener = new WindowListener.WindowListener();

        /* initialise as 'Penguins' */
        this._onChangeTheme(null, null, 'Penguins');
    },

    get DEBUG() {
        if (this._items.DEBUG) {
            return this._items.DEBUG.state;
        }
        return false;
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

    // BIG TODO: onAllWorkspaces only applies for on the desktop toons.
    changeOption: function (item, propVal, whatChanged) {
        this.log(('changeOption[ext]:' + whatChanged + ' -> ' + propVal));
        if (this.windowListener) {
            this.windowListener.changeOption(whatChanged, propVal);
        }
        this.XPenguinsLoop.changeOption(whatChanged, propVal);

        /* start/stop the windowListener */
        if (whatChanged === 'windowPreview' && this.XPenguinsLoop.is_playing()) {
            if (propVal) {
                this.windowListener.start();
            } else {
                this.windowListener.stop();
            }
        }
    },


    _createMenu: function () {
        this.log('_createMenu');
        let dummy;

        /* clear the menu */
        this.menu.removeAll();

        /* toggle to start xpenguins */
        this._items.start = new PopupMenu.PopupSwitchMenuItem(_('Start'), false);
        this._items.start.connect('toggled', Lang.bind(this, this._startXPenguins));
        this.menu.addMenuItem(this._items.start);

        /* theme submenu */
        this._themeMenu = new PopupMenu.PopupSubMenuMenuItem(_('Theme'));
        this.menu.addMenuItem(this._themeMenu);
        /* populate the combo box which sets the theme */
        this._populateThemeMenu();


        /* options submenu */
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
        this._items.nPenguins.connect('drag-end', Lang.bind(this, this._onNPenguinsChanged));
        this._optionsMenu.menu.addMenuItem(this._items.nPenguins);

        /* ignore maximised, always on visible workspace, angels, blood, god mode, verbose toggles */
        let defaults = XPenguins.XPenguinsLoop.prototype.defaultOptions();
        let blacklist = XPenguins.get_compatible_options(true);
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
            //dummy = new PopupMenu.PopupMenuItem(_('Recalc mode'), {reactive: false});
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
        this.log('_populateThemeMenu');
        this._themeMenu.menu.removeAll();
        this._items.themes = {};
        let themeList = ThemeManager.list_themes();

        if (themeList.length === 0) {
            // TODO: add new item saying 'click to reload', or just modify dropdown menu label?
            this._themeMenu.label.set_text(_('No themes found, click to reload!'));
            // FIXME: test
            this._themeMenu.connect('open', Lang.bind(this, this._populateThemeMenu));
        } else {
            this._themeInfo = ThemeManager.describe_themes(themeList, false);
            for (let i = 0; i < themeList.length; ++i) {
                let sanitised_name = themeList[i].replace(/ /g, '_');
                this._items.themes[sanitised_name] = new ThemeMenuItem(_(themeList[i]), themeList[i] === 'Penguins');
                if (this._themeInfo[sanitised_name].icon) {
                    this._items.themes[sanitised_name].set_icon(this._themeInfo[sanitised_name].icon);
                }
                this._items.themes[sanitised_name].connect('toggled', Lang.bind(this, this._onChangeTheme));
                this._items.themes[sanitised_name].connect('button-clicked', Lang.bind(this, this._onShowHelp, sanitised_name));
                this._themeMenu.menu.addMenuItem(this._items.themes[sanitised_name]);
            }
        }
    },

    _onShowHelp: function (button, name) {
        // TODO: titles etc (Different sized text)
        if (!this._themeInfo[name]) {
            this._themeInfo[name] = ThemeManager.describe_themes([name], false)[name];
        }

        /* make a popup dialogue (that needs to be dismissed), see perhaps alt-tab or panel-docklet? */
        let dialog = new AboutDialog(this._themeInfo[name].name); // <-- FIXME: translated?
        for (let i = 0; i < this._ABOUT_ORDER.length; ++i) {
            let propName = this._ABOUT_ORDER[i];
            if (this._themeInfo[name][propName]) {
                dialog.append_text('%s%s: %s'.format(
                    propName.charAt(0).toUpperCase(),
                    propName.slice(1),
                    this._themeInfo[name][propName]
                ));
            }
        }
        dialog.open(global.get_current_time());
    },

    _onChangeTheme: function () {
        this.log('_onChangeTheme');

        let themeList = [];
        /* THIS IS ALWAYS TURNING OUT 0 */
        for (let name in this._items.themes) {
            if (this._items.themes.hasOwnProperty(name) && this._items.themes[name].state) {
                themeList.push(name);
            }
        }

        this.XPenguinsLoop.set_themes(themeList, true);

        // FIXME: JSON.stringify?
        let themeListFlat = themeList.map(function (name) {
                return _(name.replace(/ /g, '_'));
            }).reduce(function (x, y) {
                return x + ',' + y;
            });
        // FIXME: truncate to '...'
        this._themeMenu.label.set_text(_('Theme') + ' (%s)'.format(themeListFlat));

        /* Set the label to match */
        this._items.nPenguins.setValue(this.XPenguinsLoop.options.nPenguins / XPenguins.PENGUIN_MAX);
        this._items.nPenguinsLabel.set_text(this.XPenguinsLoop.options.nPenguins.toString());

    },

    _startXPenguins: function (item, state) {
        log((state ? 'STARTING ' : 'STOPPING ') + 'XPenguins');

        if (state) {
            this.XPenguinsLoop.start();
            if (this._items.windowPreview.state) {
                this.windowListener.start();
            }
        } else {
            this.XPenguinsLoop.stop();
            if (this._items.windowPreview.state) {
                this.windowListener.stop();
            }
        }
    },

    _nPenguinsSliderChanged: function (slider, value) {
        this._items.nPenguinsLabel.set_text(Math.ceil(value * XPenguins.PENGUIN_MAX).toString());
    },

    _onNPenguinsChanged: function () {
        /* will have to set terminate sequence for the others.
         * Like load averaging.
         * TODO: test.
         */
        if (this.XPenguinsLoop) {
            this.XPenguinsLoop.set_number(parseInt(this._items.nPenguinsLabel.get_text(), 10));
        }
    }

};

