/* Containts ThemeManager static methods:
 * for listing/describing themes.
 */
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Shell = imports.gi.Shell;

const fileUtils = imports.misc.fileUtils;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const XPUtil = Me.imports.util;
let extensionPath = Me.path;

/***********************
 * ThemeManager object *
 ***********************/
const ThemeManager = {
    /* Look for themes in
     * $HOME/.xpenguins/themes
     * [xpenguins_directory]/themes
     */
    _themeDirectory: 'themes',
    _systemDirectory: extensionPath,
    _userDirectory: '.xpenguins',
    _configFile: 'config',

    sanitiseThemeName: function (name) {
        return name.replace(/ /g,'_');
    },

    prettyThemeName: function (name) {
        return name.replace(/_/g, ' ');
    },


    /* xpenguins_list_themes */
    /* Return a list of names of apparently valid themes -
     * basically the directory names from either the user or the system
     * theme directories that contain a file called "config" are
     * returned. Underscores in the directory names are converted into
     * spaces, but directory names that already contain spaces are
     * rejected. This is because the install program seems to choke on
     * directory names containing spaces, but theme names containing
     * underscores are ugly.
     */
    listThemes: function () {
        let themes_dir, info, fileEnum, i,
            themeList = [],
            paths = [ GLib.build_filenamev([ GLib.get_home_dir(), this._userDirectory, this._themeDirectory ]),
                      GLib.build_filenamev([ this._systemDirectory, this._themeDirectory ]) ];
        for (i = 0; i < paths.length; ++i) {
            themes_dir = Gio.file_new_for_path(paths[i]);
            if (!themes_dir.query_exists(null)) {
                continue;
            }

            fileEnum = themes_dir.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
            while ((info = fileEnum.next_file(null)) !== null) {
                let configFile = GLib.build_filenamev([themes_dir.get_path(),
                                                        info.get_name(),
                                                        this._configFile]);
                if (GLib.file_test(configFile, GLib.FileTest.EXISTS)) {
                    themeList.push(info.get_name());
                }
            }
            fileEnum.close(null);
        } // loop through system & local xpenguins dir.

      /* We convert all underscores in the directory name
       * to spaces, but actual spaces in the directory
       * name are not allowed. */
        themeList = themeList.filter(function (x) { return !x.match(' '); });
        themeList = themeList.map(function (x) { return x.replace(/_/g, ' '); });

        /* remove duplicates */
        themeList = XPUtil.removeDuplicates(themeList);

        return themeList;
    },

    /* xpenguins_theme_info (xpenguins_theme.c)
     * DescribeThemes (main.c)
     */
    describeThemes: function (themes) {
        let theme, loc, i,
            th = themes.length,
            infos = {};
        while (th--) {
            theme = themes[th].replace(/ /g, '_');
            loc = this.getThemePath(theme, 'about');
            infos[theme] = {};
            if (!loc || !GLib.file_test(loc, GLib.FileTest.EXISTS)) {
                XPUtil.warn('Theme %s not found', theme);
                continue;
            }

            /* parse the theme.
             * xpenguins_theme_info */

            /* Read about file, ignoring comments ('#'), double spaces */
            let lines = Shell.get_file_contents_utf8_sync(loc);
            lines = lines.replace(/#.+/g, '');
            lines = lines.replace(/ {2,}/g, ' ');
            lines = lines.split(/[\r\n]+/);

            /* get first word & then rest of line. */
            i = lines.length;
            while (i--) {
                let line = lines[i].trim();
                if (line.length === 0) {
                    continue;
                }
                let j = line.indexOf(' '),
                    word = line.slice(0, j).toLowerCase(),
                    rest = line.slice(j + 1);

                if (word.match(/^(artists?|maintainer|date|copyright|license|comment)$/)) {
                    infos[theme][word] = rest;
                } else if (word === 'icon') {
                    if (rest[0] !== '/') { /* make full path */
                        rest = loc.replace(/\babout$/, rest);
                    }
                    infos[theme][word] = rest;
                } else {
                    /* silently skip? */
                    XPUtil.LOG('unrecognised word %s, silently skipping', word);
                }
            }

            infos[theme].name = theme.replace(/_/g, ' ');;
            infos[theme].sanitised_name = theme;
            infos[theme].location = loc;
        } // theme loop

        return infos;
    },

    /* Return the full path or directory of the specified theme.
     * Spaces in theme name are converted to underscores
     * xpenguins_theme_directory
     * It returns the *directory* name if the theme is "valid", i.e. contains a file 'config'.
     */
    getThemeDir: function (iname) {
        /* Convert spaces to underscores */
        /* first look in $HOME/.xpenguins/themes for config,
         * then in [xpenguins_dir]/themes
         */
        let name = iname.replace(/ /g, '_'),
            dirs = [ GLib.build_filenamev([ GLib.get_home_dir(), this._userDirectory, this._themeDirectory, name ]),
                      GLib.build_filenamev([ this._systemDirectory, this._themeDirectory, name ]) ];
        for (let i = 0; i < dirs.length; ++i) {
            if (GLib.file_test(GLib.build_filenamev([dirs[i], this._configFile]),
                                GLib.FileTest.EXISTS)) {
                return dirs[i];
            }
        }

        /* Theme not found */
        return null;
    },

    getThemePath: function (iname, fName) {
        let dir = this.getThemeDir(iname);
        return GLib.build_filenamev([dir, fName || this._configFile]);
    }
}; // ThemeManager

