require('dotenv').config(); // Load .env variables
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3000;

const SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY) {
    console.error("❌ FATAL ERROR: SECRET_KEY is not defined in the .env file.");
    process.exit(1);
}

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection error:', err);
        process.exit(1);
    } else {
        console.log('✅ Successfully connected to MySQL database');
    }
});

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: No token provided.' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.error('JWT Verification Error:', err.message);
            return res.status(403).json({ message: 'Forbidden: Token is not valid or has expired.' });
        }
        req.user = user;
        next();
    });
};

app.post('/api/check-subscription', (req, res) => {
    const { loginId } = req.body;
    if (!loginId) {
        return res.status(400).json({ message: 'Login ID is required for the check.' });
    }
    const sql = "SELECT TIMEPERIOD_ENDDATETIME FROM T_TIMEPERIOD ORDER BY TIMEPERIOD_KID DESC LIMIT 1";
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Database query error on /api/check-subscription:', err);
            return res.status(500).json({ message: 'Internal server error checking subscription.' });
        }
        if (results.length === 0) {
            console.warn("⚠️ No subscription period found in T_TIMEPERIOD. Defaulting to expired.");
            return res.status(200).json({ isExpired: true });
        }
        const subscriptionEndDate = new Date(results[0].TIMEPERIOD_ENDDATETIME);
        const currentDate = new Date();
        if (subscriptionEndDate < currentDate) {
            return res.status(200).json({ isExpired: true });
        } else {
            return res.status(200).json({ isExpired: false });
        }
    });
});

app.post('/api/login', (req, res) => {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
        return res.status(400).json({ message: 'Login ID and Password are required.' });
    }

    const userSql = "SELECT USER_KID, USER_NAME, USER_PASSWORD, USER_TYPE FROM T_USER WHERE USER_LOGIN = ?";
    db.query(userSql, [loginId], (userErr, userResults) => {
        if (userErr) {
            return res.status(500).json({ message: 'Internal server error.' });
        }
        if (userResults.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials. Please try again.' });
        }
        const user = userResults[0];

        bcrypt.compare(password, user.USER_PASSWORD, (compareErr, isMatch) => {
            if (compareErr) {
                return res.status(500).json({ message: 'Internal server error during authentication.' });
            }
            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid credentials. Please try again.' });
            }

            const companySql = "SELECT COMPANY_KID FROM T_COMPANY ORDER BY COMPANY_KID ASC LIMIT 1";
            db.query(companySql, (companyErr, companyResults) => {
                if (companyErr) {
                    return res.status(500).json({ message: 'Internal server error while fetching company data.' });
                }
                const companyId = companyResults.length > 0 ? companyResults[0].COMPANY_KID : null;
                if (!companyId) {
                    return res.status(500).json({ message: "System configuration error: No companies found." });
                }

                const payload = {
                    id: user.USER_KID,
                    name: user.USER_NAME,
                    type: user.USER_TYPE,
                    companyId: companyId
                };
                const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '2h' });

                res.status(200).json({
                    message: 'Login successful!',
                    token: token
                });
            });
        });
    });
});

app.get('/api/company', verifyToken, (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(403).json({ error: "Forbidden: No company associated with your session." });
    }
    const sql = "SELECT COMPANY_NAME FROM T_COMPANY WHERE COMPANY_KID = ?";
    db.query(sql, [companyId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Internal server error" });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: `Company with ID ${companyId} not found.` });
        }
        res.json(results[0]);
    });
});

app.get('/api/companies', verifyToken, (req, res) => {
    const sql = "SELECT COMPANY_KID, COMPANY_NAME FROM T_COMPANY ORDER BY COMPANY_NAME ASC";
    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Internal server error while fetching companies." });
        }
        res.status(200).json(results);
    });
});

//================================================
// API: Get Modules -- CASE-INSENSITIVE FIX
//================================================
app.get('/api/modules', verifyToken, (req, res) => {
    const userType = req.user.type;
    const userId = req.user.id;
    let sql;
    let queryParams;
    // Use trim() in case of extra spaces in the database field
    const trimmedUserType = userType ? userType.trim() : '';

    console.log(`Fetching modules for user ID: ${userId} with type: ${trimmedUserType}`);

    // ✅ FIX: Convert to upper case for case-insensitive comparison
    if (trimmedUserType.toUpperCase() === 'S') {
        sql = `SELECT MODULE_KID, MODULE_NAME, MODULE_ICONPATH FROM T_MODULE WHERE MODULE_STATUSID = 1 ORDER BY MODULE_NAME ASC;`;
        queryParams = [];
    }
    // ✅ FIX: Convert to upper case for case-insensitive comparison
    else if (trimmedUserType.toUpperCase() === 'A') {
        sql = `SELECT DISTINCT m.MODULE_KID, m.MODULE_NAME, m.MODULE_ICONPATH FROM T_MODULE m INNER JOIN T_USERRIGHTS ur ON m.MODULE_KID = ur.USERRIGHTS_MODULEID WHERE ur.USERRIGHTS_USERTYPE = ? AND m.MODULE_STATUSID = 1 ORDER BY m.MODULE_NAME ASC;`;
        queryParams = ['A'];
    }
    // ✅ FIX: Convert to upper case for case-insensitive comparison
    else if (trimmedUserType.toUpperCase() === 'U') {
        sql = `SELECT DISTINCT mdl.MODULE_KID, mdl.MODULE_NAME, mdl.MODULE_ICONPATH FROM T_USERRIGHTS ur JOIN T_SUBMENU sm ON ur.USERRIGHTS_SUBMENUID = sm.SUBMENU_KID JOIN T_MENU m ON sm.SUBMENU_MENUID = m.MENU_KID JOIN T_MODULE mdl ON m.MENU_MODULEID = mdl.MODULE_KID WHERE ur.USERRIGHTS_USERID = ? AND mdl.MODULE_STATUSID = 1 AND m.MENU_STATUSID = 1 AND sm.SUBMENU_STATUSID = 1 ORDER BY mdl.MODULE_NAME ASC;`;
        queryParams = [userId];
    }
    // Any other user type will not have rights.
    else {
        console.warn(`Undefined user type '${trimmedUserType}' attempting to access modules.`);
        return res.json([]); // Return empty array for any other case
    }

    db.query(sql, queryParams, (err, results) => {
        if (err) {
            console.error("Database query error on /api/modules:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        res.json(results);
    });
});

//================================================
// API: Get Menus for a Module -- CASE-INSENSITIVE FIX
//================================================
app.get('/api/menus', verifyToken, (req, res) => {
    const moduleId = req.query.moduleId;
    const userType = req.user.type;
    const userId = req.user.id;

    if (!moduleId) {
        return res.status(400).json({ error: "moduleId is required" });
    }

    const trimmedUserType = userType ? userType.trim() : '';
    console.log(`Fetching menus for module ${moduleId} for user ${userId} (Type: ${trimmedUserType})`);

    // ✅ FIX: Convert to upper case for a reliable, case-insensitive check.
    if (trimmedUserType.toUpperCase() === 'S') {
        console.log(`Superuser access: Fetching all menus for module ${moduleId}.`);
        const menuSql = `
            SELECT m.MENU_KID, m.MENU_NAME, m.MENU_TYPE, s.SUBMENU_KID, s.SUBMENU_NAME, s.SUBMENU_REDIRECTPAGE
            FROM T_MENU m
            LEFT JOIN T_SUBMENU s ON m.MENU_KID = s.SUBMENU_MENUID AND s.SUBMENU_STATUSID = 1
            WHERE m.MENU_MODULEID = ? AND m.MENU_STATUSID = 1
            ORDER BY m.MENU_KID, s.SUBMENU_KID;
        `;
        db.query(menuSql, [moduleId], (err, menuResults) => {
            if (err) {
                console.error("DB error on /api/menus for Superuser:", err);
                return res.status(500).json({ error: "Internal server error" });
            }
            return res.json(menuResults);
        });
    }
    // ✅ FIX: Convert to upper case for case-insensitive comparison
    else if (trimmedUserType.toUpperCase() === 'A') {
        const verificationSql = `SELECT 1 FROM T_USERRIGHTS WHERE USERRIGHTS_USERTYPE = ? AND USERRIGHTS_MODULEID = ? LIMIT 1`;
        db.query(verificationSql, ['A', moduleId], (err, rightsResults) => {
            if (err) {
                return res.status(500).json({ error: "Error checking rights for admin" });
            }
            if (rightsResults.length === 0) {
                console.warn(`ACCESS DENIED: Admin user type attempted to access module ${moduleId} without rights.`);
                return res.status(403).json({ error: "Access Denied." });
            }
            const menuSql = `
                SELECT m.MENU_KID, m.MENU_NAME, m.MENU_TYPE, s.SUBMENU_KID, s.SUBMENU_NAME, s.SUBMENU_REDIRECTPAGE
                FROM T_MENU m
                LEFT JOIN T_SUBMENU s ON m.MENU_KID = s.SUBMENU_MENUID AND s.SUBMENU_STATUSID = 1
                WHERE m.MENU_MODULEID = ? AND m.MENU_STATUSID = 1
                ORDER BY m.MENU_KID, s.SUBMENU_KID;
            `;
            db.query(menuSql, [moduleId], (menuErr, menuResults) => {
                if (menuErr) {
                    return res.status(500).json({ error: "Error fetching menus for admin" });
                }
                return res.json(menuResults);
            });
        });
    }
    // ✅ FIX: Convert to upper case for case-insensitive comparison
    else if (trimmedUserType.toUpperCase() === 'U') {
        const sql = `
            SELECT m.MENU_KID, m.MENU_NAME, m.MENU_TYPE, s.SUBMENU_KID, s.SUBMENU_NAME, s.SUBMENU_REDIRECTPAGE
            FROM T_MENU m
            JOIN T_SUBMENU s ON m.MENU_KID = s.SUBMENU_MENUID
            JOIN T_USERRIGHTS ur ON s.SUBMENU_KID = ur.USERRIGHTS_SUBMENUID
            WHERE m.MENU_MODULEID = ? AND ur.USERRIGHTS_USERID = ? AND m.MENU_STATUSID = 1 AND s.SUBMENU_STATUSID = 1
            ORDER BY m.MENU_KID, s.SUBMENU_KID;
        `;
        db.query(sql, [moduleId, userId], (err, results) => {
            if (err) {
                console.error("DB error on /api/menus for user type U:", err);
                return res.status(500).json({ error: "Internal server error" });
            }
            return res.json(results);
        });
    }
    // Any other user type has no access.
    else {
        console.warn(`ACCESS DENIED: Undefined user type '${trimmedUserType}' attempted to access menus.`);
        return res.status(403).json({ error: "Access Denied. Your user role is not configured." });
    }
});

app.post('/api/user/switch-company', verifyToken, (req, res) => {
    const { newCompanyKid } = req.body;
    const user = req.user;
    if (!newCompanyKid) {
        return res.status(400).json({ message: "New Company ID is required." });
    }
    const newPayload = {
        id: user.id,
        name: user.name,
        type: user.type,
        companyId: newCompanyKid
    };
    const newToken = jwt.sign(newPayload, SECRET_KEY, { expiresIn: '2h' });
    res.status(200).json({
        message: 'Company switched successfully.',
        token: newToken
    });
});

app.put('/api/users/change-password', verifyToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ message: 'Old and new passwords are required.' });
    }
    const selectSql = "SELECT USER_PASSWORD FROM T_USER WHERE USER_KID = ?";
    db.query(selectSql, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Server error.' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const hashedPasswordFromDb = results[0].USER_PASSWORD;
        bcrypt.compare(oldPassword, hashedPasswordFromDb, (compareErr, isMatch) => {
            if (compareErr) {
                return res.status(500).json({ message: 'Internal server error during authentication.' });
            }
            if (!isMatch) {
                return res.status(401).json({ message: 'Incorrect old password. Please try again.' });
            }
            const saltRounds = 10;
            bcrypt.hash(newPassword, saltRounds, (hashErr, newHashedPassword) => {
                if (hashErr) {
                    return res.status(500).json({ message: 'Server error processing new password.' });
                }
                const updateSql = "UPDATE T_USER SET USER_PASSWORD = ? WHERE USER_KID = ?";
                db.query(updateSql, [newHashedPassword, userId], (updateErr, updateResult) => {
                    if (updateErr) {
                        return res.status(500).json({ message: 'Failed to update password.' });
                    }
                    res.status(200).json({ message: 'Password updated successfully!' });
                });
            });
        });
    });
});

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
