# xpenguins GNOME Shell Extension

This extension is a port of the [original XPenguins](http://xpenguins.seul.org/) to GNOME-shell. Little cute penguins walk around on your desktop and windows, and get squashed if you drag windows over them.

If you have Linux but not GNOME-shell, just use the original XPenguins.
Even if you have GNOME-shell you can run the original XPenguins, but you have to set Nautilus to handle the desktop, and the toons will think that the windows are bigger than they actually are so it can look weird.

| Penguins walk all over your windows | Configure via menu |
|:-----:|:-----:|
| ![Screenshot of XPenguins extension](http://cdn.bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension/downloads/xpenguins-screenshot.png) | ![Configure XPenguins](http://cdn.bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension/downloads/xpenguins-menu.png) |

Extension written 2012 by mathematical.coffee [mathematical.coffee@gmail.com](mailto:mathematical.coffee@gmail.com?subject=xpenguins%20question).  
The original XPenguins was written by Robin Hogan ([http://xpenguins.seul.org/](http://xpenguins.seul.org/)).  
Project webpage: [at  bitbucket](https://bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension).

---
# Options.
To start/stop XPenguins, use the toggle.

### Run in a particular window
Click the "Running in:" item and choose which window you want the XPenguins to run around in ("Cancel" to have them use the desktop).

### Theme
XPenguins is themable, and you can have multiple themes running simultaneously. 
Use the sliders to add or remove toons from each theme.
Clicking the 'help' button to the left of the slider will give you some more info on the theme and its creators.
### Ignore popups
Whether popup windows (right click menu, tooltips) are considered solid to the toons.
### Ignore maximised windows
Whether maximised windows (and windows underneath these) are ignored.
Toons only run around on the region of your desktop not covered by windows, so if windows are maximised you won't get any toons. Ignoring maximised windows means you can enjoy toons even with maximised windows. They will only bump into windows that are visible and non-maximised.
### Always on visible workspace
Whether toons stay on the workspace you started XPenguins on, or follow you around all your workspaces.
(Not applicable in windowed mode; then this setting is taken from the window itself).
### Blood
Whether to show animations with blood (for example in the original Penguin theme the 'splat' animation has blood).
### Angels
Whether to show penguin angels floating up to heaven after dying.
### God mode
Enabling "God mode" lets you squash (smite) toons by clicking on them.
### Time between frames
The time (in milliseconds) between each frame of the animation. By default the number specified by the theme is used (probably 60ms).
### Recalc Mode (GNOME 3.4+)
Ignore this. If you are suffering from severe performance issues AND you resize/move your windows really really often you can try switching this to "PAUSE" which will pause toons while you drag windows around. It probably won't make much difference at all.
### Load Averaging
This defines two thresholds; when the computer's load average (for example given by `uptime` or `top`) exceeds the lower threshold, toons will start to be killed. 
When the load average exceeds the upper threshold, all toons will be killed.
This checks the load average every 5 seconds.

---

# Installation

The easy way (recommended):

1. Download the .zip file on the [Downloads page](https://bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension/downloads).
2. Open `gnome-tweak-tool`, go to "Shell Extensions", "Install Extension" and select the .zip file.

Alternatively (developers?):

1. Checkout the repository: `hg clone https://bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension`
2. Update to the `gnome3.2` or `gnome3.4` branch (the `default` branch is **NOT** guaranteed to work!).
3. Copy the folder `xpenguins@mathematical.coffee.gmail.com` to `.local/share/gnome-shell/extensions`.
4. If on GNOME 3.2, use `dconf-editor` and modify the key `/org/gnome/shell/enabled-extensions` to include `'xpenguins@mathematical.coffee.gmail.com'`. 
If on GNOME 3.4, then just do `gnome-shell-extension-tool -e xpenguins@mathematical.coffee.gmail.com`.

All together now:

    hg clone https://bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension
    cd xpenguins-gnome-shell-extension
    # Use 'hg branches' to see what branches are available. They are GNOME versions it is compatible with.
    hg up 3.2 
    cp -r xpenguins@mathematical.coffee.gmail.com ~/.local/share/gnome-shell/extensions
    # if you have GNOME 3.4:
    gnome-shell-extension-tool -e xpenguins@mathematical.coffee.gmail.com
    # if you have GNOME 3.2:
    dconf read '/org/gnome/shell/enabled-extensions' | sed -r -e 's#\[(.+)\]#dconf write "/org/gnome/shell/enabled-extensions" "[\1, '\'xpenguins@mathematical.coffee.gmail.com\'']"#' | /bin/sh

---

# FAQ
### I want more themes!
By default this comes with the Penguins, Big Penguins, Classic Penguins, Turtles, and Bill themes.
Normal XPenguins themes will work - put them in `~/.xpenguins/themes` or in the folder `themes` in the extension directory and they will be detected.

XPenguins themes Simpsons Sonic the Hedgehog, Lemmings, Winnie the Pooh and Worms can be downloaded from the [XPenguins website](http://xpenguins.seul.org/) (on the right where it says "XPenguins Themes 1.0 (16 December 2002)").

Even more themes created by users of XPenguins can be found [here](http://xpenguins.seul.org/contrib/).

To learn about creating your own themes, read the THEMES section of the `xpenguins` man page and have a look at the config file for the Penguins theme (in `themes/Penguins/config`).

### I found a bug!
See next question.

### The toons froze and toggling them off doesn't do anything.
You must have discovered a bug in the extension! Contact me on [the issues page](https://bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension/issues/new) with:

* your gnome-shell version
* your extension version (look in metadata.json; give both dev-version and version)
* your current options configurations: what themes you had turned on and what options (on all workspaces, ignore popups, etc) were on.
* if you know how to reproduce the bug, do let me know!
* finally: look at the bottom of `~/.xsession-errors` and if it has any 'JS ERROR !!!' lines, give me those too.

You'll have to restart gnome-shell to wipe those frozen toons off your screen.

# Known issues
Here are some known issues/limitations of the program (if you think you can fix one, feel free to check out the code and have a go!)

* When you have dual monitors of different sizes, toons will happily walk in the areas of the combined screens' bounding box that are not visible to the user (patches welcome!).
* Toons don't treat the message tray or gnome-shell menus/popups as solid. This is because XPenguins can only make toons interact with objects that the window manager knows about, and things created with GNOME-shell such as the message tray/notifications are not handled by the window manager.
* When you first start XPenguins or first add in toons from another theme, you get an annoying flicker where all the toons' pixmaps are drawn on the screen very briefly before they get hidden.

Windowed mode is much harder than desktop mode, and as such has some caveats:

* if you obscure the entire top edge of the XPenguins window with another one, toons will not respawn on dying and you may see flickery explosion pictures at the top of the window. This is because toons respawn by floating down from the top of the XPenguins window but if you've obscured it they die as soon as they spawn.

# Wish list
Patches welcome! (add wish list stuff as an 'enhancement' on the [Issues page](https://bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension/issues?status=new&status=open).

- toons talk to each other with little speech bubbles
- toons jump up and down when you get new mail
- see [issues page](https://bitbucket.org/mathematicalcoffee/xpenguins-gnome-shell-extension/issues?status=new&status=open) for more.

---

# Branch Info (for developers)

* Branch `gnome3.2` is compatible with GNOME 3.2. It is supposed to be stable.
* Branch `gnome3.4` is meant to be for GNOME 3.4. It is supposed to be stable.
* Default branch is a polyglot - has try/catches in it such that it works simultaneously with 3.2 and 3.4.
  This is just helpful for me to do testing.
  It is also a lot more verbose than the release branches.
  Default branch is not guaranteed to be stable at *any* commit.
* I attempt to make new features with bookmarks instead of branches.
