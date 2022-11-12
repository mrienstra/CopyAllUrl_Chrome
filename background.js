const MODES = {
  highlighted_tab_only: {
    highlighted_tab_only: true,
    walk_all_windows: false,
  },
  walk_all_windows: {
    highlighted_tab_only: false,
    walk_all_windows: true,
  },
  current_window_only: {
    highlighted_tab_only: false,
    walk_all_windows: false,
  },
};

function localStorageIsTrue(key) {
  return localStorage[key] === "true";
}

/**
 * Gére l'accès au presse papier
 * (on est obligé de passer par la background page pour y accéder, cf: http://stackoverflow.com/questions/6925073/copy-paste-not-working-in-chrome-extension)
 */
Clipboard = {
  /**
   * Ecrit la chaîne passée en paramètre dans le presse papier (fonction "Copier")
   *
   * On a pas accès au presse papier via l'API Google Chrome,
   * donc l'astuce consiste à placer le texte à copier dans un <textarea>,
   * de sélectionner tout le contenu de ce <textarea>, et de copier.
   *
   * @param String str Chaîne à copier dans le presse-papier
   * @param Bool extended_mime Indique si on doit copier le type MIME text/html en plus du texte brut
   */
  write: function (str, extended_mime) {
    if (str == "" || str == undefined) {
      str = "<empty>";
    }

    // Copie par défaut, via le clipboardBuffer
    clipboardBuffer.val(str);
    clipboardBuffer.select();

    // Copie via l'API (clipboardData)
    var oncopyBackup = document.oncopy;
    document.oncopy = function (e) {
      // Si on n'utilise pas le type MIME html, on sort tout de suite pour laisser la main à la méthode par défaut : clipboardBuffer
      if (typeof extended_mime == "undefined" || extended_mime != true) {
        return;
      }
      e.preventDefault();
      e.clipboardData.setData("text/html", str);
      e.clipboardData.setData("text/plain", str);
    };
    document.execCommand("copy");
    document.oncopy = oncopyBackup;
  },

  /**
   * Retourne le contenu du presse papier (String)
   */
  read: function () {
    clipboardBuffer.val("");
    clipboardBuffer.select();
    document.execCommand("paste");
    return clipboardBuffer.val();
  },
};

/**
 * Objet qui gère les actions (clic sur liens de fonctionnalités dans popup.html)
 */
Action = {
  /**
   * Copie les URLs de la fenêtre passé en paramètre dans le presse papier
   * @param opt.window  : fenêtre dont on copie les URL
   * @param opt.mode  : Override options, force mode
   */
  copy: function (opt) {
    const mode = (opt.mode && MODES[opt.mode]) || {};

    // Récupération configuration
    let extended_mime = localStorage["mime"] === "html";
    const format = localStorage["format"] || "text";
    const highlighted_tab_only =
      mode.highlighted_tab_only !== undefined
        ? mode.highlighted_tab_only
        : localStorageIsTrue("highlighted_tab_only");
    const walk_all_windows =
      mode.walk_all_windows !== undefined
        ? mode.walk_all_windows
        : localStorageIsTrue("walk_all_windows");

    // Par défaut, on récupère tous les onglets de la fenêtre opt.window
    var tabQuery = { windowId: opt.window.id };

    // Si "Copy tabs from all windows" est coché, suppression du filtre sur fenêtre courante
    try {
      if (walk_all_windows) {
        tabQuery.windowId = null;
      }
    } catch (ex) {}

    chrome.tabs.query(tabQuery, function (tabs) {
      var outputText = "";

      // Filtrage des onglets
      var tabs_filtered = [];
      for (var i = 0; i < tabs.length; i++) {
        if (highlighted_tab_only && !tabs[i].highlighted) continue;
        tabs_filtered.push(tabs[i]);
      }
      tabs = tabs_filtered;

      // Génération des données copiées
      if (format == "html") {
        outputText = CopyTo.html(tabs);
      } else if (format == "custom") {
        outputText = CopyTo.custom(tabs);
      } else if (format == "json") {
        outputText = CopyTo.json(tabs);
        extended_mime = false;
      } else {
        outputText = CopyTo.text(tabs);
        extended_mime = false;
      }

      // Copie la liste d'URL dans le presse papier
      Clipboard.write(outputText, extended_mime);

      // Indique à la popup le nombre d'URL copiées, pour affichage dans la popup
      chrome.runtime.sendMessage({ type: "copy", copied_url: tabs.length });
    });
  },

  /**
   * Ouvre toutes les URLs du presse papier dans des nouveaux onglets
   */
  paste: function () {
    var clipboardString = Clipboard.read();

    // Extraction des URL, soit ligne par ligne, soit intelligent paste
    if (localStorage["intelligent_paste"] == "true") {
      var urlList = clipboardString.match(
        /(https?|ftp|ssh|mailto):\/\/[a-z0-9\/:%_+.,#?!@&=-]+/gi
      );
    } else {
      var urlList = clipboardString.split("\n");
    }

    // Si urlList est vide, on affiche un message d'erreur et on sort
    if (urlList == null) {
      chrome.runtime.sendMessage({
        type: "paste",
        errorMsg: "No URL found in the clipboard",
      });
      return;
    }

    // Extraction de l'URL pour les lignes au format HTML (<a...>#url</a>)
    $.each(urlList, function (key, val) {
      var matches = val.match(new RegExp('<a[^>]+href="([^"]+)"', "i"));
      try {
        urlList[key] = matches[1];
      } catch (e) {}

      urlList[key] = jQuery.trim(urlList[key]);
    });

    // Suppression des URLs non conformes
    urlList = urlList.filter(function (url) {
      if (url == "" || url == undefined) {
        return false;
      }
      return true;
    });

    // Ouverture de toutes les URLs dans des onglets
    $.each(urlList, function (key, val) {
      chrome.tabs.create({ url: val });
    });

    // Indique à la popup de se fermer
    chrome.runtime.sendMessage({ type: "paste" });
  },
};

/**
 * Fonctions de copie des URL dans une chaîne de caractères
 */
CopyTo = {
  // Copie les URLs des onglets au format html
  html: function (tabs) {
    var anchor = localStorage["anchor"] ? localStorage["anchor"] : "url";
    var row_anchor = "";
    var s = "";
    for (var i = 0; i < tabs.length; i++) {
      row_anchor = tabs[i].url;
      if (anchor == "title") {
        try {
          Encoder.EncodeType = "entity";
          row_anchor = Encoder.htmlEncode(tabs[i].title);
        } catch (ex) {
          row_anchor = tabs[i].title;
        }
      }
      s += '<a href="' + tabs[i].url + '">' + row_anchor + "</a><br/>";
      s = s + "\n";
    }
    return s;
  },

  // Copie les URLs des onglets au format custom
  custom: function (tabs) {
    var template =
      localStorage["format_custom_advanced"] &&
      localStorage["format_custom_advanced"] != ""
        ? localStorage["format_custom_advanced"]
        : null;
    if (template == null) {
      return "ERROR : Row template is empty ! (see options page)";
    }
    var s = "";
    for (var i = 0; i < tabs.length; i++) {
      var current_row = template;
      var current_url = tabs[i].url;
      var current_title = tabs[i].title;

      // Encodage (html entities) du title
      // try{
      // Encoder.EncodeType = "entity";
      // current_title = Encoder.htmlEncode(current_title);
      // } catch(ex){}

      // Injection des variables dans le template
      current_row = current_row.replace(/\$url/gi, current_url);
      current_row = current_row.replace(/\$title/gi, current_title);

      s += current_row;
    }
    return s;
  },

  // Copie les URLs des onglets au format texte
  text: function (tabs) {
    var s = "";
    for (var i = 0; i < tabs.length; i++) {
      s += tabs[i].url;
      s = s + "\n";
    }
    return s;
  },

  // Copie les URLs des onglets au format JSON
  json: function (tabs) {
    var data = [];
    for (var i = 0; i < tabs.length; i++) {
      data.push({ url: tabs[i].url, title: tabs[i].title });
    }
    return JSON.stringify(data);
  },
};

/**
 * Raccourci clavier
 */
chrome.commands.onCommand.addListener(function (command) {
  switch (command) {
    case "copy":
      chrome.windows.getCurrent(function (win) {
        Action.copy({ window: win });
      });
      break;
    case "paste":
      Action.paste();
      break;
  }
});

/**
 * Update notification
 */
UpdateManager = {
  /** Informaion remplie par le callback runtime.onInstalled */
  runtimeOnInstalledStatus: null,

  /** (bool) Indique si une mise à jour de l'extension a eu lieu récemment */
  recentUpdate: function () {
    try {
      var timeDiff =
        new Date().getTime() -
        new Date(parseInt(localStorage["update_last_time"])).getTime();
      if (timeDiff < 1000 * 3600 * 24) {
        return true;
      }
    } catch (ex) {}
    return false;
  },

  /** Défini le badge si une mise à jour a eu lieu récemment */
  setBadge: function () {
    if (!UpdateManager.recentUpdate()) {
      chrome.browserAction.setBadgeText({ text: "" });
      return;
    }
    chrome.browserAction.setBadgeText({ text: "NEW" });
  },
};
UpdateManager.setBadge();
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason != "update") {
    UpdateManager.runtimeOnInstalledStatus =
      "Not an update (" + details.reason + ")";
    return;
  }

  if (details.previousVersion == chrome.runtime.getManifest().version) {
    UpdateManager.runtimeOnInstalledStatus =
      "Same version (" + details.previousVersion + ")";
    return;
  }

  // Mémorisation date de la dernière mise à jour
  localStorage["update_last_time"] = new Date().getTime();
  localStorage["update_previous_version"] = details.previousVersion;
  UpdateManager.runtimeOnInstalledStatus = "Updated";

  // Mise à jour badge
  UpdateManager.setBadge();

  // Affichage de la notification
  chrome.notifications.create(
    "cpau_update_notification",
    {
      type: "basic",
      title: "Copy All Urls updated",
      message:
        "New version installed : " +
        chrome.runtime.getManifest().version +
        ". Click to see new features.",
      iconUrl: "img/umbrella_128.png",
    },
    function (notificationId) {}
  );
  chrome.notifications.onClicked.addListener(function (notificationId) {
    if (notificationId == "cpau_update_notification") {
      chrome.tabs.create({
        url: "https://github.com/vincepare/CopyAllUrl_Chrome",
      });
    }
  });
});

jQuery(function ($) {
  // Au chargement de la page, on créé une textarea qui va servir à lire et à écrire dans le presse papier
  clipboardBuffer = $('<textarea id="clipboardBuffer"></textarea>');
  clipboardBuffer.appendTo("body");
});
