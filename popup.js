bkg = chrome.extension.getBackgroundPage(); // Récupération d'une référence vers la backgroundpage

// Affichage du nombre d'URL copiées, message envoyé par la background page
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (typeof request.type != "string") return;
  switch (request.type) {
    case "copy":
      var nombre = request.copied_url > 1 ? "s" : "";
      jQuery("#message")
        .removeClass("error")
        .html(
          "<b>" +
            request.copied_url +
            "</b> url" +
            nombre +
            " successfully copied !"
        );
      setTimeout(function () {
        window.close();
      }, 3000); // Fermeture de la popup quelques secondes après affichage du message
      break;
    case "paste":
      // Si un message d'erreur est présent, on l'affiche, sinon on ferme la popup
      if (request.errorMsg) {
        jQuery("#message").addClass("error").html(request.errorMsg);
        return;
      }
      window.close();
      break;
  }
});

/**
 * Gestion des boutons de la popup
 */
jQuery(function ($) {
  $("#actionCopy").on("click", function (e, fromDefaultAction) {
    // On récupére la fenêtre courante
    chrome.windows.getCurrent(function (win) {
      bkg.Action.copy({ window: win });
    });
  });
  $("#actionPaste").on("click", function (e, fromDefaultAction) {
    bkg.Action.paste();
  });
  $("#actionOption").click(function (e) {
    chrome.tabs.create({ url: "options.html" });
  });
  $("#contribute a").click(function (e) {
    chrome.tabs.create({ url: "options.html#donate" });
  });

  // Default action
  var default_action = localStorage["default_action"]
    ? localStorage["default_action"]
    : "menu";
  if (default_action != "menu") {
    // Masquage des boutons
    $("body>ul").hide();
    $("#message").css({ padding: "3px 0 5px" });

    // Déclenchement de l'action par défaut configurée dans les options
    switch (default_action) {
      case "copy":
        $("#actionCopy").trigger("click", [true]);
        break;
      case "paste":
        $("#actionPaste").trigger("click", [true]);
        break;
    }
  }

  // Affichage notification nouvelle version dans la page d'option
  if (bkg.UpdateManager.recentUpdate()) {
    var content =
      'New version recently installed. Check the <a href="http://finalclap.github.io/CopyAllUrl_Chrome/">changelog</a>.';
    $("#recently-updated")
      .html(content)
      .show()
      .find("a")
      .click(function (e) {
        chrome.tabs.create({ url: $(this).attr("href") });
      });
  }
});
