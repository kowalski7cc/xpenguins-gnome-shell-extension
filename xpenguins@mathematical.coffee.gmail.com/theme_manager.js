const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const fileUtils = imports.misc.fileUtils;

// temp until two distinct versions:
var Extension, extensionPath;
try {
    // gnome 3.2
    Extension = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
    extensionPath = imports.ui.extensionSystem.extensionMeta['xpenguins@mathematical.coffee.gmail.com'].path;
} catch(err) {
    // gnome 3.4
    Extension = imports.misc.extensionUtils.getCurrentExtension();
    extensionPath = Extension.path;
    Extension = Extension.imports;
}
const XPUtil = Extension.util;

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
    list_themes: function() {
        let themeList = [];

        /* first look in $HOME/.xpenguins/themes for config,
         * then in [xpenguins_dir]/themes 
         */
        let paths = [ GLib.build_filenamev([ GLib.get_home_dir(), this.user_directory, this.theme_directory ]),
                      GLib.build_filenamev([ this.system_directory, this.theme_directory ]) ];
        for ( let i=0; i<paths.length; ++i ) {
            let themes_dir = Gio.file_new_for_path(paths[i]);
            if  ( !themes_dir.query_exists(null) ) 
                continue;

            /* Could not get fileUtils.listDirAsync to work.
             * I think I need to make it emit a signal when it's done,
             * & listen to that signal on the side of anything that calls this function.
             * In any case, here is a synchronous version for the meantime.
             */
            // UPTO TODO
            let fileEnum = themes_dir.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
            while ((let info = fileEnum.next_file(null)) != null) {
                 let configFile = GLib.build_filenamev([themes_dir.get_path(),
                                                        info.get_name(),
                                                        this.config_file]);
                 if ( GLib.file_test(configFile, GLib.FileTest.EXISTS) ) {
                     themesList.push(info.get_name());
                 }
            }
            fileEnum.close(null);
/*
            // Note: could do Lang.bind but need two of them!
            let config_file = this.config_file;
            fileUtils.listDirAsync(themes_dir, Lang.bind(this,
                    function ( dirInfos ) {
                        // look for config file, return name of dir, append to themeList
                        themeList.push.apply(themeList,
                            dirInfos.filter( Lang.bind(this,
                              function(themedirinfo) {
                                  let configFile = GLib.build_filenamev([themes_dir.get_path(),
                                                                         themedirinfo.get_name(),
                                                                         config_file]);
//                                  print(configFile);
                                  return GLib.file_test(configFile, GLib.FileTest.EXISTS);
                              })).map(function(dirInfo) { return dirInfo.get_name(); }));
                    }));
                    */
        } // loop through system & local xpenguins dir.

      /* We convert all underscores in the directory name 
       * to spaces, but actual spaces in the directory
       * name are not allowed. */
        themeList = themeList.filter(function(x) !x.match(' '));
        themeList = themeList.map(function(x) x.replace(/_/g,' '));

        /* remove duplicates */
        themeList = XPUtil.removeDuplicates(themeList);

        return themeList;
    },

    // xpenguins_theme_info(char *name)
    theme_info: function(iname) {
    },

    /* Return the full path of the specified theme.
     * Spaces in theme name are converted to underscores
     * xpenguins_theme_directory
     */
    get_theme_path: function(iname) {
        /* Convert spaces to underscores */
        let name = iname.replace(/ /g,'_');

        /* first look in $HOME/.xpenguins/themes for config,
         * then in [xpenguins_dir]/themes 
         */
        let paths = [ GLib.build_filenamev([ GLib.get_home_dir(), this.user_directory, this.theme_directory, name, this.config_file ]),
                      GLib.build_filenamev([ this.system_directory, this.theme_directory, name, this.config_file ]) ];
        for ( let i=0; i<paths.length; ++i ) {
            if ( GLib.file_test(paths[i], GLib.FileTest.EXISTS) ) {
                return paths[i];
            }
        }

        /* Theme not found */
        return null;
    }
}; // ThemeManager

