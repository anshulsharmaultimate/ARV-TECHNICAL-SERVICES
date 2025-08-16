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

// ⭐⭐⭐ IMPORTANT: YOUR SECRET KEY FROM .env! ⭐⭐⭐
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

// Ensure 'uploads' directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer storage configuration
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

// --- MySQL Connection Configuration ---
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

//================================================
// ⭐ JWT VERIFICATION MIDDLEWARE (IMPROVED LOGGING) ⭐
//================================================
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: No token provided.' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            // ✨ ADDED THIS LOG FOR BETTER DEBUGGING ✨
            console.error('JWT Verification Error:', err.message); 
            return res.status(403).json({ message: 'Forbidden: Token is not valid or has expired.' });
        }
        req.user = user;
        next();
    });
};


//================================================
// ✨ API ENDPOINT: Check Subscription Validity ✨
//================================================
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
            console.log(`Subscription for user '${loginId}' is EXPIRED. End date: ${subscriptionEndDate.toISOString()}`);
            return res.status(200).json({ isExpired: true });
        } else {
            console.log(`Subscription for user '${loginId}' is ACTIVE. End date: ${subscriptionEndDate.toISOString()}`);
            return res.status(200).json({ isExpired: false });
        }
    });
});


//================================================
// API: Login User -- UPDATED TO INCLUDE COMPANY ID
//================================================
app.post('/api/login', (req, res) => {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
        return res.status(400).json({ message: 'Login ID and Password are required.' });
    }
    
    const userSql = "SELECT USER_KID, USER_NAME, USER_PASSWORD, USER_TYPE FROM T_USER WHERE USER_LOGIN = ?";
    db.query(userSql, [loginId], (userErr, userResults) => {
        if (userErr) {
            console.error('Database query error on /api/login (user fetch):', userErr);
            return res.status(500).json({ message: 'Internal server error.' });
        }
        if (userResults.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials. Please try again.' });
        }
        const user = userResults[0];

        bcrypt.compare(password, user.USER_PASSWORD, (compareErr, isMatch) => {
            if (compareErr) {
                console.error('Error comparing password:', compareErr);
                return res.status(500).json({ message: 'Internal server error during authentication.' });
            }
            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid credentials. Please try again.' });
            }
            
            const companySql = "SELECT COMPANY_KID FROM T_COMPANY ORDER BY COMPANY_KID ASC LIMIT 1";
            db.query(companySql, (companyErr, companyResults) => {
                if (companyErr) {
                    console.error('Database query error on /api/login (company fetch):', companyErr);
                    return res.status(500).json({ message: 'Internal server error while fetching company data.' });
                }
                const companyId = companyResults.length > 0 ? companyResults[0].COMPANY_KID : null;
                if (!companyId) {
                    console.error("FATAL: No companies found in T_COMPANY. Cannot set default company for JWT.");
                    return res.status(500).json({ message: "System configuration error: No companies found." });
                }

                const payload = {
                    id: user.USER_KID,
                    name: user.USER_NAME,
                    type: user.USER_TYPE,
                    companyId: companyId
                };
                const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '2h' });

                console.log(`✅ User '${loginId}' (Type: ${user.USER_TYPE}, Company: ${companyId}) logged in successfully.`);
                res.status(200).json({
                    message: 'Login successful!',
                    token: token
                });
            });
        });
    });
});


//================================================
// API: Get Company Info -- UPDATED TO USE TOKEN
//================================================
app.get('/api/company', verifyToken, (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(403).json({ error: "Forbidden: No company associated with your session." });
    }
    const sql = "SELECT COMPANY_NAME FROM T_COMPANY WHERE COMPANY_KID = ?";
    db.query(sql, [companyId], (err, results) => {
        if (err) {
            console.error("Database query error on /api/company:", err);
            return res.status(500).json({ error: "Internal server error" });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: `Company with ID ${companyId} not found.` });
        }
        res.json(results[0]);
    });
});

//================================================
// API: Get ALL Companies from T_COMPANY
//================================================
app.get('/api/companies', verifyToken, (req, res) => {
    const sql = "SELECT COMPANY_KID, COMPANY_NAME FROM T_COMPANY ORDER BY COMPANY_NAME ASC";
    console.log("Fetching list of all companies...");
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Database query error on /api/companies:", err);
            return res.status(500).json({ error: "Internal server error while fetching companies." });
        }
        if (results.length === 0) {
            console.warn("⚠️ No companies found in T_COMPANY.");
            return res.status(200).json([]);
        }
        console.log(`✅ Successfully fetched ${results.length} companies.`);
        res.status(200).json(results);
    });
});

//================================================
// API: Get Modules
//================================================
app.get('/api/modules', verifyToken, (req, res) => {
    const userType = req.user.type;
    const userId = req.user.id;
    let sql;
    let queryParams;
    console.log(`Fetching modules for user ID: ${userId} with type: ${userType}`);
    if (userType === 'A') {
        sql = `SELECT DISTINCT m.MODULE_KID, m.MODULE_NAME, m.MODULE_ICONPATH FROM T_MODULE m INNER JOIN T_USERRIGHTS ur ON m.MODULE_KID = ur.USERRIGHTS_MODULEID WHERE ur.USERRIGHTS_USERTYPE = ? AND m.MODULE_STATUSID = 1 ORDER BY m.MODULE_NAME ASC;`;
        queryParams = ['A'];
    } else if (userType === 'S') {
        sql = `SELECT MODULE_KID, MODULE_NAME, MODULE_ICONPATH FROM T_MODULE WHERE MODULE_STATUSID = 1 ORDER BY MODULE_NAME ASC;`;
        queryParams = [];
    } else if (userType === 'U') {
        sql = `SELECT DISTINCT mdl.MODULE_KID, mdl.MODULE_NAME, mdl.MODULE_ICONPATH FROM T_USERRIGHTS ur JOIN T_SUBMENU sm ON ur.USERRIGHTS_SUBMENUID = sm.SUBMENU_KID JOIN T_MENU m ON sm.SUBMENU_MENUID = m.MENU_KID JOIN T_MODULE mdl ON m.MENU_MODULEID = mdl.MODULE_KID WHERE ur.USERRIGHTS_USERID = ? AND mdl.MODULE_STATUSID = 1 AND m.MENU_STATUSID = 1 AND sm.SUBMENU_STATUSID = 1 ORDER BY mdl.MODULE_NAME ASC;`;
        queryParams = [userId];
    } else {
        sql = `SELECT DISTINCT m.MODULE_KID, m.MODULE_NAME, m.MODULE_ICONPATH FROM T_MODULE m INNER JOIN T_USERRIGHTS ur ON m.MODULE_KID = ur.USERRIGHTS_MODULEID WHERE ur.USERRIGHTS_USERID = ? AND m.MODULE_STATUSID = 1 ORDER BY m.MODULE_NAME ASC;`;
        queryParams = [userId];
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
// API: Get Menus for a Module
//================================================
app.get('/api/menus', verifyToken, (req, res) => {
    const moduleId = req.query.moduleId;
    const userType = req.user.type;
    const userId = req.user.id;
    if (!moduleId) {
        return res.status(400).json({ error: "moduleId is required" });
    }
    console.log(`Fetching menus for module ${moduleId} for user ${userId} (Type: ${userType})`);
    if (userType === 'U') {
        const sql = `SELECT m.MENU_KID, m.MENU_NAME, m.MENU_TYPE, s.SUBMENU_KID, s.SUBMENU_NAME, s.SUBMENU_REDIRECTPAGE FROM T_MENU m JOIN T_SUBMENU s ON m.MENU_KID = s.SUBMENU_MENUID JOIN T_USERRIGHTS ur ON s.SUBMENU_KID = ur.USERRIGHTS_SUBMENUID WHERE m.MENU_MODULEID = ? AND ur.USERRIGHTS_USERID = ? AND m.MENU_STATUSID = 1 AND s.SUBMENU_STATUSID = 1 ORDER BY m.MENU_KID, s.SUBMENU_KID;`;
        db.query(sql, [moduleId, userId], (err, results) => {
            if (err) {
                console.error("Database query error on /api/menus for user type U:", err);
                return res.status(500).json({ error: "Internal server error" });
            }
            res.json(results);
        });
    } else {
        let verificationSql;
        let verificationParams;
        if (userType === 'A') {
            verificationSql = `SELECT 1 FROM T_USERRIGHTS WHERE USERRIGHTS_USERTYPE = ? AND USERRIGHTS_MODULEID = ? LIMIT 1`;
            verificationParams = ['A', moduleId];
        } else {
            verificationSql = `SELECT 1 FROM T_USERRIGHTS WHERE USERRIGHTS_USERID = ? AND USERRIGHTS_MODULEID = ? LIMIT 1`;
            verificationParams = [userId, moduleId];
        }
        db.query(verificationSql, verificationParams, (err, rightsResults) => {
            if (err) {
                console.error("DB error on /api/menus rights check:", err);
                return res.status(500).json({ error: "Internal server error while checking rights" });
            }
            if (rightsResults.length === 0) {
                console.warn(`ACCESS DENIED: User ${userId} (Type: ${userType}) attempted to access menus for module ${moduleId}.`);
                return res.status(403).json({ error: "Access Denied. You do not have permission to view this menu." });
            }
            console.log(`Access GRANTED for user ${userId} to module ${moduleId}. Fetching all menus...`);
            const menuSql = `SELECT m.MENU_KID, m.MENU_NAME, m.MENU_TYPE, s.SUBMENU_KID, s.SUBMENU_NAME, s.SUBMENU_REDIRECTPAGE FROM T_MENU m LEFT JOIN T_SUBMENU s ON m.MENU_KID = s.SUBMENU_MENUID AND s.SUBMENU_STATUSID = 1 WHERE m.MENU_MODULEID = ? AND m.MENU_STATUSID = 1 ORDER BY m.MENU_KID, s.SUBMENU_KID;`;
            db.query(menuSql, [moduleId], (menuErr, menuResults) => {
                if (menuErr) {
                    console.error("DB query error on /api/menus fetch:", menuErr);
                    return res.status(500).json({ error: "Internal server error while fetching menus" });
                }
                res.json(menuResults);
            });
        });
    }
});

//================================================
// API: Switch Company and get a new Token
//================================================
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
    console.log(`🔄 User '${user.name}' switched company to ${newCompanyKid}. New token issued.`);
    res.status(200).json({
        message: 'Company switched successfully.',
        token: newToken
    });
});

//================================================
// API: Change User Password
//================================================
app.put('/api/users/change-password', verifyToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ message: 'Old and new passwords are required.' });
    }
    const selectSql = "SELECT USER_PASSWORD FROM T_USER WHERE USER_KID = ?";
    db.query(selectSql, [userId], (err, results) => {
        if (err) {
            console.error('DB error selecting user for password change:', err);
            return res.status(500).json({ message: 'Server error.' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const hashedPasswordFromDb = results[0].USER_PASSWORD;
        bcrypt.compare(oldPassword, hashedPasswordFromDb, (compareErr, isMatch) => {
            if (compareErr) {
                console.error('Error comparing password:', compareErr);
                return res.status(500).json({ message: 'Internal server error during authentication.' });
            }
            if (!isMatch) {
                return res.status(401).json({ message: 'Incorrect old password. Please try again.' });
            }
            const saltRounds = 10;
            bcrypt.hash(newPassword, saltRounds, (hashErr, newHashedPassword) => {
                if (hashErr) {
                    console.error('Error hashing new password:', hashErr);
                    return res.status(500).json({ message: 'Server error processing new password.' });
                }
                const updateSql = "UPDATE T_USER SET USER_PASSWORD = ? WHERE USER_KID = ?";
                db.query(updateSql, [newHashedPassword, userId], (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error('DB error updating password:', updateErr);
                        return res.status(500).json({ message: 'Failed to update password.' });
                    }
                    console.log(`✅ Password updated successfully for user ID: ${userId}`);
                    res.status(200).json({ message: 'Password updated successfully!' });
                });
            });
        });
    });
});


// --- Start the server ---
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});