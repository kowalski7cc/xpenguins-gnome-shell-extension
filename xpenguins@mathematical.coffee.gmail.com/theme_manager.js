const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Shell = imports.gi.Shell;

const fileUtils = imports.misc.fileUtils;

// temp until two distinct versions:
var Me, extensionPath;
try {
    // gnome 3.2
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
    extensionPath = imports.ui.extensionSystem.extensionMeta['xpenguins@mathematical.coffee.gmail.com'].path;
} catch (err) {
    // gnome 3.4
    Me = imports.misc.extensionUtils.getCurrentExtension();
    extensionPath = Me.path;
    Me = Me.imports;
}
const XPUtil = Me.util;

/***********************
 * ThemeManager object *
 ***********************/
//ThemeManager.ThemeManager = {
const ThemeManager = {
    /*
     * Look for themes in
     * $HOME/.xpenguins/themes
     * [xpenguins_directory]/themes
     */
    theme_directory: 'themes',
    // TODO:
    system_directory: extensionPath,
    user_directory: '.xpenguins',
    config_file: 'config',

    /* xpenguins_list_themes */
    /* Return a NULL-terminated list of names of apparently valid themes -
     * basically the directory names from either the user or the system
     * theme directories that contain a file called "config" are
     * returned. Underscores in the directory names are converted into
     * spaces, but directory names that already contain spaces are
     * rejected. This is because the install program seems to choke on
     * directory names containing spaces, but theme names containing
     * underscores are ugly.
     */
    list_themes: function () {
        /* first look in $HOME/.xpenguins/themes for config,
         * then in [xpenguins_dir]/themes
         */
        let themes_dir, info, fileEnum, i,
            themeList = [],
            paths = [ GLib.build_filenamev([ GLib.get_home_dir(), this.user_directory, this.theme_directory ]),
                      GLib.build_filenamev([ this.system_directory, this.theme_directory ]) ];
        for (i = 0; i < paths.length; ++i) {
            themes_dir = Gio.file_new_for_path(paths[i]);
            if (!themes_dir.query_exists(null)) {
                continue;
            }

            /* Could not get fileUtils.listDirAsync to work.
             * I think I need to make it emit a signal when it's done,
             * & listen to that signal on the side of anything that calls this function.
             * In any case, here is a synchronous version for the meantime.
             */
            fileEnum = themes_dir.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
            while ((info = fileEnum.next_file(null)) !== null) {
                let configFile = GLib.build_filenamev([themes_dir.get_path(),
                                                        info.get_name(),
                                                        this.config_file]);
                if (GLib.file_test(configFile, GLib.FileTest.EXISTS)) {
                    themeList.push(info.get_name());
                }
            }
            fileEnum.close(null);
/*
            // Note: could do Lang.bind but need two of them!
            let config_file = this.config_file;
            fileUtils.listDirAsync(themes_dir, Lang.bind(this,
                    function (dirInfos) {
                        // look for config file, return name of dir, append to themeList
                        themeList.push.apply(themeList,
                            dirInfos.filter(Lang.bind(this,
                              function (themedirinfo) {
                                  let configFile = GLib.build_filenamev([themes_dir.get_path(),
                                                                         themedirinfo.get_name(),
                                                                         config_file]);
//                                  print(configFile);
                                  return GLib.file_test(configFile, GLib.FileTest.EXISTS);
                              })).map(function (dirInfo) { return dirInfo.get_name(); }));
                    }));
                    */
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

    // TODO: graphical popup window.
    /* xpenguins_theme_info (xpenguins_theme.c)
     * DescribeThemes (main.c)
     */
    describe_themes: function (themes, noisy) {
        let theme, loc, i,
            th = themes.length,
            infos = {};
        while (th--) {
            theme = themes[th].replace(/ /g, '_');
            loc = this.get_theme_path(theme, 'about');
            log(('Parsing theme ' + theme));
            infos[theme] = {};
            if (!loc || !GLib.file_test(loc, GLib.FileTest.EXISTS)) {
                // TODO: make popup & continue
                log('Theme %s not found'.format(theme));
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
                    log(('unrecognised word ' + word + ', silently skipping'));
                }
            }

            /* print (popup box? append all?) */
            infos[theme].name = theme.replace(/_/g, ' ');
            infos[theme].sanitised_name = theme;
            infos[theme].location = loc;

            if (noisy) {
                log(('Theme: '      + infos[theme].name));
                log(('Date: '       + infos[theme].date));
                log(('Artist(s): '  + infos[theme].artist));
                log(('Copyright: '  + infos[theme].copyright));
                log(('License: '    + infos[theme].licence));
                log(('Maintainer: ' + infos[theme].maintainer));
                log(('Location: '   + infos[theme].location));
                log(('Icon: '       + infos[theme].icon));
                log(('Comment: '    + infos[theme].comment));
            }
        } // theme loop

        return infos;
    },

    /* Return the full path or directory of the specified theme.
     * Spaces in theme name are converted to underscores
     * xpenguins_theme_directory
     * It returns the *directory* name if the theme is "valid", i.e. contains a file 'config'.
     */
    get_theme_dir: function (iname) {
        /* Convert spaces to underscores */
        /* first look in $HOME/.xpenguins/themes for config,
         * then in [xpenguins_dir]/themes
         */
        let name = iname.replace(/ /g, '_'),
            dirs = [ GLib.build_filenamev([ GLib.get_home_dir(), this.user_directory, this.theme_directory, name ]),
                      GLib.build_filenamev([ this.system_directory, this.theme_directory, name ]) ];
        for (let i = 0; i < dirs.length; ++i) {
            if (GLib.file_test(GLib.build_filenamev([dirs[i], this.config_file]),
                                GLib.FileTest.EXISTS)) {
                return dirs[i];
            }
        }

        /* Theme not found */
        return null;
    },

    get_theme_path: function (iname, fName) {
        let dir = this.get_theme_dir(iname);
        return GLib.build_filenamev([dir, fName || this.config_file]);
    }
}; // ThemeManager

