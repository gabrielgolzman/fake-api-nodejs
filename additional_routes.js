const formidable = require("formidable");
const { access, copyFile, unlink } = require("fs/promises");
const { generateJwtToken } = require("./jwt-authenticate");

const handleUploadFile = async (req, file) => {
  const uploadFolder = "uploads";

  try {
    // Copy file from temp folder to uploads folder (not rename to allow cross-device link)
    await copyFile(file.path, `./public/${uploadFolder}/${file.name}`);

    // Remove temp file
    await unlink(file.path);

    // Return new path of uploaded file
    file.path = `${req.protocol}://${req.get("host")}/${uploadFolder}/${
      file.name
    }`;

    return file;
  } catch (err) {
    throw err;
  }
};

module.exports = {
  loginHandler: (db, req, res) => {
    const { username, email, password } = req.body;

    const user = db
      .get("users")
      .find(
        (user) =>
          (user.username === username || user.email === email) &&
          user.password === password
      )
      .value();

    if (user) {
      const token = generateJwtToken(user.id);
      const { password, ...userWithoutPassword } = user;

      res.jsonp({
        ...userWithoutPassword,
        token,
      });
    } else {
      res.status(400).jsonp({ message: "Username or password is incorrect!" });
    }
  },

  registerHandler: (db, req, res) => {
    const { username, email, password } = req.body;

    if (!password && (!email || !username)) {
      res.status(400).jsonp({ message: "Please input all required fields!" });
      return;
    }

    const existUsername = db
      .get("users")
      .find((user) => user.username === username)
      .value();

    if (existUsername) {
      res.status(400).jsonp({
        message:
          "The username already exists. Please use a different username!",
      });
      return;
    }

    const existEmail = db
      .get("users")
      .find((user) => user.email === email)
      .value();

    if (existEmail) {
      res.status(400).jsonp({
        message:
          "The email address is already being used! Please use a different email!",
      });
      return;
    }

    const lastUser = db.get("users").maxBy("id").value();
    const newUserId = parseInt(lastUser.id) + 1;
    const newUser = { id: newUserId, ...req.body };

    db.get("users").push(newUser).write();

    res.jsonp(newUser);
  },

  uploadFileHandler: (req, res) => {
    if (req.headers["content-type"] === "application/json") {
      res
        .status(400)
        .jsonp({ message: 'Content-Type "application/json" is not allowed.' });
      return;
    }

    const form = formidable();

    form.parse(req, async (err, fields, files) => {
      let file = files.file;

      if (err || !file) {
        res.status(400).jsonp({ message: 'Missing "file" field.' });
        return;
      }

      try {
        file = await handleUploadFile(req, file);
        res.jsonp(file);
      } catch (err) {
        console.log(err);
        res.status(500).jsonp({ message: "Cannot upload file." });
      }
    });
  },

  uploadFilesHandler: (req, res) => {
    if (req.headers["content-type"] === "application/json") {
      res
        .status(400)
        .jsonp({ message: 'Content-Type "application/json" is not allowed.' });
      return;
    }

    const form = formidable({ multiples: true });

    form.parse(req, async (err, fields, files) => {
      let filesUploaded = files.files;

      if (err || !filesUploaded) {
        res.status(400).jsonp({ message: 'Missing "files" field.' });
        return;
      }

      // If user upload 1 file, transform data to array
      if (!Array.isArray(filesUploaded)) filesUploaded = [filesUploaded];

      try {
        // Handle all uploaded files
        filesUploaded = await Promise.all(
          filesUploaded.map(async (file) => {
            try {
              file = await handleUploadFile(req, file);
              return file;
            } catch (err) {
              throw err;
            }
          })
        );

        res.jsonp(filesUploaded);
      } catch (err) {
        console.log(err);
        res.status(500).jsonp({ message: "Cannot upload files." });
      }
    });
  },
};
