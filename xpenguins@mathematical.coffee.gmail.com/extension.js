/* *** CODE *** */
const Gio      = imports.gi.Gio;
const GLib     = imports.gi.GLib;
const Lang     = imports.lang;

const Main      = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('xpenguins');
const _ = Gettext.gettext;

/* my files */
const Me = imports.misc.extensionUtils.getCurrentExtension();
const ThemeManager = Me.imports.themeManager;
const UI = Me.imports.ui;
const WindowListener = Me.imports.windowListener;
const XPenguins = Me.imports.xpenguins;
const XPUtil = Me.imports.util;

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

/*
 * XPenguinsMenu Object
 */

const XPenguinsMenu = new Lang.Class({
    Name: 'XPenguinsMenu',
    Extends: PanelMenu.SystemStatusButton,

    _init: function (extensionPath) {
        XPUtil.DEBUG('_init');
        /* Initialise */
        this.parent('emblem-favorite', 'xpenguins');
        this.actor.add_style_class_name('xpenguins-icon');
        this.setGIcon(new Gio.FileIcon({
            file: Gio.file_new_for_path(GLib.build_filenamev([extensionPath,
                      'penguin.png']))
        }));

        /* items */
        this._optionsMenu = null;
        this._themeMenu = null;
        this._items = {};
        this._themeInfo = {};
        this._toggles = {
            ignorePopups       : _("Ignore popups"),
            ignoreMaximised    : _("Ignore maximised windows"),
            onAllWorkspaces    : _("Always on visible workspace"),
            blood              : _("Show blood"),
            angels             : _("Show angels"),
            squish             : _("God Mode"),
        };
        this._ABOUT_ORDER = ['name', 'date', 'artist', 'copyright',
            'license', 'maintainer', 'location', 'comment'];
        this._THEME_STRING_LENGTH_MAX = 30;

        /* create an Xpenguin Loop object which stores the XPenguins program */
        this._XPenguinsLoop = new XPenguins.XPenguinsLoop();

        /* Create menus */
        this._createMenu();
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
        let dummy,
            opts = this._XPenguinsLoop.options,
            blacklist = XPenguins.getCompatibleOptions(true);

        /* clear the menu */
        this.menu.removeAll();

        /* toggle to start xpenguins */
        this._items.start = new PopupMenu.PopupSwitchMenuItem(_("Start"),
            false);
        this._items.start.connect('toggled', Lang.bind(this,
            this._startXPenguins));
        this.menu.addMenuItem(this._items.start);

        /* choice of window */
        if (!blacklist.onDesktop) {
            this._items.onDesktop = new PopupMenu.PopupMenuItem(_("Running in: ")
                + _("Desktop"));
            this._items.onDesktop.connect('activate', Lang.bind(this,
                this._onChooseWindow));
            this.menu.addMenuItem(this._items.onDesktop);
        }

        /* theme submenu */
        this._themeMenu = new PopupMenu.PopupSubMenuMenuItem(_("Theme"));
        this.menu.addMenuItem(this._themeMenu);

        /* options submenu */
        this._optionsMenu = new PopupMenu.PopupSubMenuMenuItem(_("Options"));
        this.menu.addMenuItem(this._optionsMenu);

        /* ignore maximised, ignore popups, god mode,
         * always on visible workspace, angels, blood, verbose toggles */
        for (let propName in this._toggles) {
            if (this._toggles.hasOwnProperty(propName) && !blacklist[propName]) {
                this._items[propName] = new PopupMenu.PopupSwitchMenuItem(
                    this._toggles[propName], opts[propName] || false);
                this._items[propName].connect('toggled',
                    Lang.bind(this, this.changeOption, propName));
                this._optionsMenu.menu.addMenuItem(this._items[propName]);
            }
        }

        /* animation speed */
        this._items.delay = new UI.SliderMenuItem(_("Time between frames (ms)"),
                60, 10, 200, true);
        this._optionsMenu.menu.addMenuItem(this._items.delay);
        this._items.delay.connect('drag-end', Lang.bind(this, this.changeOption,
            'sleep_msec'));

        /* Load averaging. */
        // TODO: what is reasonable? look at # CPUs and times by fudge factor?
        if (!blacklist.loadAveraging) {
            this._items.loadAveraging = new UI.LoadAverageSliderMenuItem(_("Load average reduce threshold"),
                    -0.01, 2, -0.01, 2, false, 2);
            this._optionsMenu.menu.addMenuItem(this._items.loadAveraging);
            this._items.loadAveraging.connect('drag-end', Lang.bind(this, function (slider, which, val) {
                if (which === 0) {
                    /* set load2 first to avoid problems with it being unset */
                    this.changeOption(this._items.loadAveraging, this._items.loadAveraging.getUpperValue(), 'load2');
                }
                this.changeOption(this._items.loadAveraging, val, 'load' + (which+1));
            }));
        }

        /* RecalcMode combo box: only if global.display has grab-op- events. */
        if (!blacklist.recalcMode) {
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

        /* Listen to various signals from XPenguinsLoop to update the sliders
         * accordingly */
        this._XPenguinsLoop.connect('ntoons-changed', Lang.bind(this,
            this._onChangeThemeNumber));
        if (this._items.loadAveraging) {
            this._XPenguinsLoop.connect('load-averaging-start', Lang.bind(this,
                function () { this._items.loadAveraging.setBeingUsed(true, false);
                })
            );
            this._XPenguinsLoop.connect('load-averaging-end', Lang.bind(this,
                function () { this._items.loadAveraging.setBeingUsed(false, false);
                })
            );
            this._XPenguinsLoop.connect('load-averaging-kill', Lang.bind(this,
                function () { this._items.loadAveraging.setBeingUsed(true, true);
                })
            );
        }
        this._XPenguinsLoop.connect('xpenguins-stopped', Lang.bind(this,
            function () {
                this._items.start.setToggleState(false);
                if (this._items.loadAveraging) {
                    this._items.loadAveraging.setBeingUsed(false, false);
                }
            })
        );
        this._XPenguinsLoop.connect('xpenguins-window-killed',
            Lang.bind(this, this._onWindowChosen));
        this._XPenguinsLoop.connect('option-changed',
            Lang.bind(this, this._onOptionChanged));
        this._XPenguinsLoop.connect('stopped', Lang.bind(this, function () {
            /* Quietly reset numbers for the loop from sliders for next time
             * (on the loop ending they are all 0)
             */
            let themes = [], ns = [];
            for (let th in this._items.themes) {
                if (this._items.themes.hasOwnProperty(th)) {
                    let n = this._items.themes[th].getValue();
                    if (n) {
                        themes.push(th);
                        ns.push(n);
                    }
                }
            }
            this._XPenguinsLoop.setThemeNumbers(themes, ns, false);
        }));

        this._populateThemeMenu();
    },

    _populateThemeMenu: function () {
        XPUtil.DEBUG("_populateThemeMenu");
        this._themeMenu.menu.removeAll();
        this._items.themes = {};
        let themeList = ThemeManager.listThemes();

        if (themeList.length === 0) {
            this._themeMenu.label.set_text(_("No themes found, click to reload!"));
            this._reloadThemesID = this._themeMenu.menu.connect('open-state-changed',
                Lang.bind(this, this._populateThemeMenu));
        } else {
            this._themeInfo = ThemeManager.describeThemes(themeList, false);
            for (let i = 0; i < themeList.length; ++i) {
                let sanitised_name = ThemeManager.sanitiseThemeName(themeList[i]);
                this._items.themes[sanitised_name] = new UI.ThemeSliderMenuItem(
                    _(themeList[i]), 0, 0, XPenguins.PENGUIN_MAX, true);
                this._items.themes[sanitised_name].setIcon(this._themeInfo[sanitised_name].icon);
                this._items.themes[sanitised_name].connect('drag-end',
                    Lang.bind(this, this._onChangeTheme, sanitised_name, true));
                this._items.themes[sanitised_name].connect('button-clicked',
                    Lang.bind(this, this._onShowHelp, sanitised_name));
                this._themeMenu.menu.addMenuItem(this._items.themes[sanitised_name]);
            }
            if (this._reloadThemesID) {
                this._themeMenu.menu.disconnect(this._reloadThemesID);
                delete this._reloadThemesID;
            }
            if (this._items.themes['Penguins']) {
                this._onChangeTheme(this._items.themes['Penguins'], -1, 'Penguins',
                    false);
            } else {
                this._themeMenu.label.set_text(_("Theme"));
            }
        }
    },

    _onShowHelp: function (button, name) {
        if (!this._themeInfo[name]) {
            this._themeInfo[name] = ThemeManager.describeThemes([name], false)[name];
        }

        let dialog = new UI.AboutDialog(this._themeInfo[name].name);
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
        dialog.setIcon(this._themeInfo[name].icon);
        dialog.open(global.get_current_time());
    },

    _onChangeTheme: function (item, value, sanitised_name, silent) {
        XPUtil.DEBUG('_onChangeTheme: ' + sanitised_name);

        /* set the numbers so we can read them back to the slider bars */
        this._XPenguinsLoop.setThemeNumbers(sanitised_name, value, silent);

        let themeListFlat = this._XPenguinsLoop.getThemes();
        if (themeListFlat.length) {
            themeListFlat = themeListFlat.map(function (name) {
                return ThemeManager.prettyThemeName(name);
            }).reduce(function (x, y) {
                return x + ',' + y;
            });
            if (themeListFlat.length > this._THEME_STRING_LENGTH_MAX) {
                themeListFlat = themeListFlat.substr(0,
                    this._THEME_STRING_LENGTH_MAX - 3) + '...';
            }
        } else {
            themeListFlat = 'none';
        }
        this._themeMenu.label.set_text(_("Theme") + ' (%s)'.format(themeListFlat));
    },

    _onChangeThemeNumber: function (loop, sanitised_name, n) {
        XPUtil.DEBUG('[ext] _onChangeThemeNumber[%s] to %d; updating slider',
            sanitised_name, n);
        if (n !== this._items.themes[sanitised_name].getValue()) {
            this._items.themes[sanitised_name].setValue(n);
        }
    },

    _onChooseWindow: function () {
        XPUtil.DEBUG('[ext] _onChooseWindow');
        let dialog = new UI.WindowPickerDialog();
        dialog.open(global.get_current_time());
        dialog._windowSelectedID = dialog.connect('window-selected', Lang.bind(this, this._onWindowChosen));
    },

    _onWindowChosen: function (dialog, metaWindow) {
        dialog.disconnect(dialog._windowSelectedID);
        /* if meta window is null or has been destroyed in the meantime, use
         * the desktop. */
        let string = _("Running in: ") + (metaWindow ? metaWindow.get_title() :
            _("Desktop"));
        if (string.length > this._THEME_STRING_LENGTH_MAX) {
            string = string.substr(0, this._THEME_STRING_LENGTH_MAX - 3) + '...';
        }
        this._items.onDesktop.label.set_text(string);

        this._XPenguinsLoop.setWindow(metaWindow ?
            metaWindow.get_compositor_private() : global.stage);

        /* 'always on visible workspace' is invalid if !onDesktop */
        this._items.onAllWorkspaces.setSensitive(!metaWindow);
    },

    _onOptionChanged: function (loop, propName, propVal) {
        XPUtil.DEBUG('[ext] _onOptionChanged: %s -> %s', propName, propVal);
        if (this._items[propName]) {
            this._items[propName].setToggleState(propVal);
        }
    },

    _startXPenguins: function (item, state) {
        XPUtil.DEBUG((state ? 'STARTING ' : 'STOPPING ') + 'XPenguins');
        if (state) {
            this._XPenguinsLoop.start();
        } else {
            this._XPenguinsLoop.stop();
        }
    },

    destroy: function () {
        this._XPenguinsLoop.destroy();
        this.parent();
    }
});

