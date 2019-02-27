var url = require("url");
var util = require("util");
var showdown = require("showdown");
var AuthIDMDSig = require("authid-md-sig").AuthIDMDSig;

$(document).ready(() => {
  loadApp();
  loadSignDiv();
});

function loadSignDiv() {
  // Show the div
  $("#sign-div").css({
    display: "block"
  });

  $("#sign-button").click(() => {
    alert("Please upload a document to sign.");
  });

  $("#upload-button").click(() => {
    $("#document-file").click();
  });

  var uploadFile;

  $("#document-file").change((doc) => {
    var fileReader = new FileReader();

    fileReader.onload = () => {
      var data = fileReader.result.split(','); // data <-- in this var you have the file data in Base64 format
      loadDocument(uploadFile.name, Buffer.from(data[1], "base64").toString());
    };

    uploadFile = $("#document-file").prop("files")[0];
    fileReader.readAsDataURL(uploadFile);
  });

}

function loadDocument(fileName, data) {
  // Remove the upload button
  $("#upload-button").css({
    display: "none"
  });
  var extension = fileName.split('.').pop().toLowerCase(0);

  // If it's not a raw markdown file
  if (extension == "mdsig") {
    var encoded = Buffer.from(data).toString("base64");
    var signedDoc = AuthIDMDSig.fromEncoded(authID, encoded);

    showSignedDoc(fileName, signedDoc);
  } else {
    showRawDoc(fileName, data);
  }
}

function showSignedDoc(fileName, signedDoc) {
  showMarkdown(signedDoc.getMdDoc());

  $("#sign-button").unbind();
  $("#sign-button").css({
    display: "none"
  });

  $("#verify-button").unbind();
  $("#verify-button").click(() => {
    verifyDoc(signedDoc);
  });

  $("#witness-button").unbind();
  $("#witness-button").click(() => {
    witnessDocument(fileName, signedDoc);
  });

  /*
   * Populate and disable main subject fields and
   */

  var mainSubjectFieldIds = signedDoc.getFieldIds();
  var attributes = signedDoc.getAttributes();

  // Populate
  for (var attrName in attributes) {
    $(util.format("#%s", attrName)).val(attributes[attrName]);
  }

  // Disable inputs
  for (var i in mainSubjectFieldIds) {
    $(util.format("#%s", mainSubjectFieldIds[i])).attr("disabled", "disabled");
  }

  /*
   * Show witnesses
   */
  setWitnessesToView(signedDoc.getWitnesses());
}

function showRawDoc(fileName, doc) {
  showMarkdown(doc);

  var sigDoc = new AuthIDMDSig(authID, doc);

  /*
   * Disable witness fields. Note replace with dropdown of witness fields
   */

  var witnessFieldIds = sigDoc.getWitnessFieldIds();

  for (var i in witnessFieldIds) {
    $(util.format("#%s", witnessFieldIds[i])).attr("disabled", "disabled");
  }

  $("#sign-button").css({
    display: "block"
  });
  $("#sign-button").unbind();
  $("#sign-button").click(() => {
    signDocument(fileName, sigDoc);
  });
}

function showMarkdown(data) {
  var converter = new showdown.Converter();
  var docHtml = converter.makeHtml(data);

  $("#doc-view").html(docHtml);
}

function signDocument(fileName, document) {
  var fieldIds = document.getFieldIds();

  // 1) Get the attributes from the document
  var attributes = {};

  for (var i in fieldIds) {
    var value = $(util.format("#%s", fieldIds[i])).val();

    attributes[fieldIds[i]] = value;
  }

  document.sign(attributes).then(() => {
    setDownloadData(fileName.split(".")[0] + ".mdsig", document.encode());
    showSignedDoc(fileName, document)
    showSnackbar("Successfully signed the document!", 5000);
  }).catch((err) => {
    showSnackbar("Could not sign document!", 5000);
  });
}

function witnessDocument(fileName, document) {
  var fieldIds = document.getWitnessFieldIds();

  // 1) Get the attributes from the document
  var attributes = {};

  for (var i in fieldIds) {
    var value = $(util.format("#%s", fieldIds[i])).val();

    attributes[fieldIds[i]] = value;
  }

  document.witness(attributes).then(() => {
    setDownloadData(fileName.split(".")[0] + ".mdsig", document.encode());
    showSignedDoc(fileName, document)
    showSnackbar("Successfully witnessed the document!", 5000);
  }).catch((err) => {
    showSnackbar("Could not witness doccument!", 5000);
  });
}

function verifyDoc(signedDoc) {
  return new Promise(async (onSuccess, onError) => {
    try {
      // Verify the main sig
      let verified = await signedDoc.verify();

      // Verify the witnesses
      let witnesses = signedDoc.getWitnesses();

      for (var i in witness) {
        var witness = witnesses[i];
        await witness.verify();
      }

      var message = util.format("Verified. ID %s", verified["id"]);
      showSnackbar(message, 5000);
    } catch (err) {
      showSnackbar("Document signature is not valid!", 5000);
    }
  });
}

function setWitnessesToView(witnesses) {
  $("#witnesses-div").empty(); // Clear the div
  var witnessButtonMap = {};

  for (var i = 0; i < witnesses.length; i++) {
    var witness = witnesses[i];
    var witnessAttributes = witness.getAttributes();

    var button = $("<button/>", {
      id: "witnessButton" + (i + 1),
      text: "Witness " + (i + 1),
      class: "collapsible"
    });

    var content = $("<div></div>", {
      class: "content"
    });

    for (var attrName in witnessAttributes) {
      var value = witnessAttributes[attrName];

      var attrNameHeader = $("<h4/>", {
        text: attrName.replace(/([A-Z])/g, " $1").toUpperCase()
      });

      var valueView = $("<input/>", {
        type: "text",
        value: value,
        disabled: "disabled"
      });

      content.append(attrNameHeader);
      content.append(valueView);
    }

    var verifyButtonId = "witnessVerifcationButton" + i;

    var verifyButton = $("<button/>", {
      text: "VERIFY",
      id: verifyButtonId
    });

    witnessButtonMap[verifyButtonId] = witness;

    verifyButton.click((event) => {
      var buttonId = event.currentTarget.id;
      var witness = witnessButtonMap[buttonId];

      witness.verify().then((verified) => {
        var message = util.format("Witness verified. ID %s", verified["id"]);
        showSnackbar(message, 5000);
      }).catch((err) => {
        showSnackbar("Witness signature is not valid!", 5000);
      });
    });

    content.append(verifyButton);

    $("#witnesses-div").append(button);
    $("#witnesses-div").append(content);
  }

  updateWitnessView();
}

function updateWitnessView() {
  var coll = $(".collapsible");
  var i;

  for (i = 0; i < coll.length; i++) {
    coll[i].addEventListener("click", function() {
      this.classList.toggle("active");
      var content = this.nextElementSibling;
      if (content.style.display === "block") {
        content.style.display = "none";
      } else {
        content.style.display = "block";
      }
    });
  }
}

function setDownloadData(fileName, data) {
  $("#save-button").unbind();
  $("#save-button").click(() => {
    download(fileName, data);
  });

}

function download(filename, text) {
  var element = document.createElement("a");
  element.setAttribute("href", "data:text/mdsig;base64," + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

function loadApp() {
  if (authID == undefined || authID == null) {
    alert("Warning: Application will not work. There is not AuthID driver installed.");
  }

  $(window).bind('beforeunload', () => {
    return 'Are you sure you want to leave?';
  });
}

function showSnackbar(message, length) {
  return new Promise((onSuccess, onError) => {
    $("#snackbar").html(message);
    $("#snackbar").toggleClass("show");

    setTimeout(() => {
      $("#snackbar").removeClass("show");

      onSuccess();
    }, length);
  });
}
