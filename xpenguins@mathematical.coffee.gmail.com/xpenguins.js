/*
 * xpenguins_start
 * xpenguins_frame
 */

/* Connect to X server and upload data 
 * Returns nothing, throw error on error.
 */
xpenguins_start: function( display_name ) {
    if ( !GLOBAL.ToonData )
        throw new Error(_('No toon data installed'));

    if ( !GLOBAL.XPenguins.active ) {
        let i, index, imod =1;
        let configure_mask = TOON.SIDEBOTTOMBLOCK;

        /* Open display */
        let display = global.display; // ToonOpenDisplay: no support for display_name.
        if ( !display ) {
            throw new Error(_('Could not open display %s'.format(display_name)));
        }

        // NOT DONE
        
        /* Set up various preferences: Edge of screen is solid,
         * and if a signal is caught then exit the main event loop */
        ToonConfigure(configure_mask);

        /* Set the distance the window can move (up, down, left, right)
         * and penguin can still cling on */
        ToonSetMaximumRelocate(16,16,16,16);

        /* Send the pixmaps to the X server - penguin_data should have been 
         * defined in penguins/def.h */
        ToonInstallData(penguin_data, penguin_ngenera, PENGUIN_NTYPES);

        /* work out the size of the background pixmaps */
        char * error;
        if ( error=__xpenguins_store_genus_information( penguin_ngenera, PENGUIN_NTYPES ) ) {
            return error;
        }

        if (!xpenguins_specify_number) {
          penguin_number = 0;
          for (i = 0; i < penguin_ngenera; ++i) {
        penguin_number += penguin_numbers[i];
          }
        }
        /* Set the genus of each penguin, whether it is to be activated or not */
        for (index = 0; index < penguin_ngenera && index < PENGUIN_MAX; ++index) {
          penguin[index].genus = index;
        }
        while (index < PENGUIN_MAX) {
          for (i = 0; i < penguin_ngenera; ++i) {
        int j;
        for (j = 0; j < penguin_numbers[i]-imod && index < PENGUIN_MAX; ++j) {
          penguin[index++].genus = i;
        }
          }
          imod = 0;
        }
        /* Initialise penguins */
        for (i = 0; i < penguin_number; i++) {
          penguin[i].pref_direction = -1;
          penguin[i].pref_climb = 0;
          penguin[i].hold = 0;
          __xpenguins_init_penguin(penguin+i);
          penguin[i].x_map = 0;
          penguin[i].y_map = 0;
          penguin[i].width_map = 1; /* So that the screen isn't completely */
          penguin[i].height_map = 1; /*    cleared at the start */
          penguin[i].mapped = 0;
        }
        /* Find out where the windows are - should be done 
         * just before beginning the event loop */
        ToonLocateWindows();
      }
    }
    GLOBAL.XPenguins.active = 1;
}

