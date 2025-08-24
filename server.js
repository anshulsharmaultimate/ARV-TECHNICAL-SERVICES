require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3000;

const SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY) {
    console.error("❌ FATAL ERROR: SECRET_KEY is not defined in the .env file.");
    process.exit(1);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
}).promise();

db.connect().then(() => {
    console.log('✅ Successfully connected to MySQL database');
}).catch(err => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
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

app.post('/api/check-subscription', async (req, res) => {
    try {
        const sql = "SELECT TIMEPERIOD_ENDDATETIME FROM T_TIMEPERIOD ORDER BY TIMEPERIOD_KID DESC LIMIT 1";
        const [results] = await db.query(sql);
        if (results.length === 0) return res.status(200).json({ isExpired: true });

        const subscriptionEndDate = new Date(results[0].TIMEPERIOD_ENDDATETIME);
        const isExpired = subscriptionEndDate < new Date();
        console.log(`Subscription check: End date is ${subscriptionEndDate.toISOString()}. Status: ${isExpired ? 'EXPIRED' : 'ACTIVE'}`);
        res.status(200).json({ isExpired });
    } catch (err) {
        console.error("Subscription check error:", err);
        res.status(500).json({ message: 'Internal server error checking subscription.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { loginId, password } = req.body;
    if (!loginId || !password) {
        return res.status(400).json({ message: 'Login ID and Password are required.' });
    }
    try {
        // ===================================================================
        // == UPDATED QUERY HERE ==
        // ===================================================================
        const userSql = "SELECT USER_KID, USER_NAME, USER_PASSWORD, USER_TYPE FROM T_USER WHERE USER_LOGIN = ? AND USER_STATUSID <> '2'";
        const [userResults] = await db.query(userSql, [loginId]);
        // ===================================================================

        if (userResults.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials or account is inactive.' });
        }
        const user = userResults[0];
        const isMatch = await bcrypt.compare(password, user.USER_PASSWORD);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials or account is inactive.' });
        }
        let companyId;
        if (user.USER_TYPE === 'S') {
            companyId = 1;
            console.log(`User '${loginId}' is a Superuser. Defaulting to Company ID 1.`);
        } else {
            const companySql = `
                SELECT USERCOMPANY_COMPANYID FROM T_USERCOMPANY 
                WHERE USERCOMPANY_USERID = ? AND USERCOMPANY_DEFAULTYN = 'Y' AND USERCOMPANY_STATUSID <> '2' 
                LIMIT 1
            `;
            const [companyResults] = await db.query(companySql, [user.USER_KID]);
            if (companyResults.length === 0) {
                console.error(`Login failed: User '${loginId}' (ID: ${user.USER_KID}) has no ACTIVE default company set.`);
                return res.status(403).json({ message: "Access denied: No default company is assigned to your account or it is inactive." });
            }
            companyId = companyResults[0].USERCOMPANY_COMPANYID;
        }
        const payload = { id: user.USER_KID, name: user.USER_NAME, type: user.USER_TYPE, companyId: companyId };
        const token = jwt.sign(payload, SECRET_KEY, { expiresIn: '8h' });
        console.log(`✅ User '${loginId}' (Type: ${user.USER_TYPE}, Company: ${companyId}) logged in successfully.`);
        res.status(200).json({ message: 'Login successful!', token: token });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});

app.get('/api/company', verifyToken, async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) return res.status(403).json({ error: "Forbidden: No company associated with your session." });
    try {
        const sql = "SELECT COMPANY_NAME FROM T_COMPANY WHERE COMPANY_KID = ?";
        const [results] = await db.query(sql, [companyId]);
        if (results.length === 0) return res.status(404).json({ error: `Company with ID ${companyId} not found.` });
        res.json(results[0]);
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get('/api/companies-for-user', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const userType = req.user.type;
    try {
        let sql;
        let queryParams = [];
        if (userType === 'S') {
            sql = `SELECT COMPANY_KID, COMPANY_NAME FROM T_COMPANY ORDER BY COMPANY_NAME ASC`;
        } else {
            sql = `
                SELECT c.COMPANY_KID, c.COMPANY_NAME 
                FROM T_USERCOMPANY uc
                JOIN T_COMPANY c ON uc.USERCOMPANY_COMPANYID = c.COMPANY_KID
                WHERE uc.USERCOMPANY_USERID = ? AND uc.USERCOMPANY_STATUSID <> '2'
                ORDER BY c.COMPANY_NAME ASC
            `;
            queryParams = [userId];
        }
        const [results] = await db.query(sql, queryParams);
        res.status(200).json(results);
    } catch (err) {
        console.error("[API /companies-for-user] Database error:", err);
        res.status(500).json({ message: "Database error while fetching companies." });
    }
});

app.get('/api/modules', verifyToken, async (req, res) => {
    const userType = (req.user.type || '').trim().toUpperCase();
    const userId = req.user.id;
    const companyId = req.user.companyId;
    console.log(`[API /modules] User: ${userId}, Type: '${userType}', Company: ${companyId}`);
    let sql, queryParams;

    if (userType === 'S') {
        sql = `SELECT MODULE_KID, MODULE_NAME, MODULE_ICONPATH FROM T_MODULE WHERE MODULE_STATUSID = 1 ORDER BY MODULE_NAME ASC;`;
        queryParams = [];
    } else if (userType === 'A') {
        sql = `
            SELECT DISTINCT mdl.MODULE_KID, mdl.MODULE_NAME, mdl.MODULE_ICONPATH 
            FROM T_USERRIGHTS ur
            JOIN T_MODULE mdl ON ur.USERRIGHTS_MODULEID = mdl.MODULE_KID
            WHERE ur.USERRIGHTS_USERID = ? 
              AND ur.USERRIGHTS_USERCOMPANYID = ? 
              AND ur.USERRIGHTS_USERTYPE = 'A'
              AND mdl.MODULE_STATUSID = 1
            ORDER BY mdl.MODULE_NAME ASC;
        `;
        queryParams = [userId, companyId];
    } else if (userType === 'U') {
        sql = `
            SELECT DISTINCT mdl.MODULE_KID, mdl.MODULE_NAME, mdl.MODULE_ICONPATH 
            FROM T_USERRIGHTS ur 
            JOIN T_SUBMENU sm ON ur.USERRIGHTS_SUBMENUID = sm.SUBMENU_KID 
            JOIN T_MENU m ON sm.SUBMENU_MENUID = m.MENU_KID 
            JOIN T_MODULE mdl ON m.MENU_MODULEID = mdl.MODULE_KID 
            WHERE ur.USERRIGHTS_USERID = ? 
              AND ur.USERRIGHTS_USERCOMPANYID = ?
              AND ur.USERRIGHTS_USERTYPE = 'U'
              AND mdl.MODULE_STATUSID = 1 
              AND m.MENU_STATUSID = 1 
              AND sm.SUBMENU_STATUSID = 1 
            ORDER BY mdl.MODULE_NAME ASC;
        `;
        queryParams = [userId, companyId];
    } else {
        return res.json([]);
    }

    try {
        const [results] = await db.query(sql, queryParams);
        res.json(results);
    } catch (err) {
        console.error("[API /modules] Database query error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.get('/api/menus', verifyToken, async (req, res) => {
    const { moduleId } = req.query;
    const userType = (req.user.type || '').trim().toUpperCase();
    const userId = req.user.id;
    const companyId = req.user.companyId;
    if (!moduleId) return res.status(400).json({ error: "moduleId is required" });
    console.log(`[API /menus] Module: ${moduleId}, User: ${userId}, Type: '${userType}', Company: ${companyId}`);
    let sql, queryParams;

    if (userType === 'S' || userType === 'A') {
        sql = `
            SELECT m.MENU_KID, m.MENU_NAME, m.MENU_TYPE, s.SUBMENU_KID, s.SUBMENU_NAME, s.SUBMENU_REDIRECTPAGE 
            FROM T_MENU m 
            LEFT JOIN T_SUBMENU s ON m.MENU_KID = s.SUBMENU_MENUID AND s.SUBMENU_STATUSID = 1 
            WHERE m.MENU_MODULEID = ? AND m.MENU_STATUSID = 1 
            ORDER BY m.MENU_KID, s.SUBMENU_KID;
        `;
        queryParams = [moduleId];
    } else if (userType === 'U') {
        sql = `
            SELECT m.MENU_KID, m.MENU_NAME, m.MENU_TYPE, s.SUBMENU_KID, s.SUBMENU_NAME, s.SUBMENU_REDIRECTPAGE 
            FROM T_MENU m 
            JOIN T_SUBMENU s ON m.MENU_KID = s.SUBMENU_MENUID 
            JOIN T_USERRIGHTS ur ON s.SUBMENU_KID = ur.USERRIGHTS_SUBMENUID 
            WHERE m.MENU_MODULEID = ? 
              AND ur.USERRIGHTS_USERID = ? 
              AND ur.USERRIGHTS_USERCOMPANYID = ? 
              AND ur.USERRIGHTS_USERTYPE = 'U'
              AND m.MENU_STATUSID = 1 
              AND s.SUBMENU_STATUSID = 1 
            ORDER BY m.MENU_KID, s.SUBMENU_KID;
        `;
        queryParams = [moduleId, userId, companyId];
    } else {
        return res.status(403).json({ error: "Access Denied. Your user role is not configured." });
    }

    try {
        const [results] = await db.query(sql, queryParams);
        res.json(results);
    } catch (err) {
        console.error(`[API /menus] DB error for user type ${userType}:`, err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post('/api/user/switch-company', verifyToken, (req, res) => {
    const { newCompanyKid } = req.body;
    const user = req.user;
    if (!newCompanyKid) return res.status(400).json({ message: "New Company ID is required." });
    const newPayload = { ...user, companyId: newCompanyKid };
    delete newPayload.iat;
    delete newPayload.exp;
    const newToken = jwt.sign(newPayload, SECRET_KEY, { expiresIn: '8h' });
    res.status(200).json({ message: 'Company switched successfully.', token: newToken });
});

app.put('/api/users/change-password', verifyToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    if (!oldPassword || !newPassword) return res.status(400).json({ message: 'Old and new passwords are required.' });
    try {
        const selectSql = "SELECT USER_PASSWORD FROM T_USER WHERE USER_KID = ?";
        const [results] = await db.query(selectSql, [userId]);
        if (results.length === 0) return res.status(404).json({ message: 'User not found.' });
        const isMatch = await bcrypt.compare(oldPassword, results[0].USER_PASSWORD);
        if (!isMatch) return res.status(401).json({ message: 'Incorrect old password. Please try again.' });
        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        const updateSql = "UPDATE T_USER SET USER_PASSWORD = ? WHERE USER_KID = ?";
        await db.query(updateSql, [newHashedPassword, userId]);
        res.status(200).json({ message: 'Password updated successfully!' });
    } catch (err) {
        console.error("Change password error:", err);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

app.get('/api/contact-directory', verifyToken, async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(403).json({ message: "Forbidden: No company associated with your session." });
    }
    console.log(`[API /contact-directory] Fetching for Company: ${companyId}`);
    try {
        const sql = `
            SELECT 
                CONTACTDIR_NAME, CONTACTDIR_MOBILE, CONTACTDIR_EMAIL, 
                CONTACTDIR_ADDRESS, CONTACTDIR_REMARK 
            FROM T_CONTACTDIR 
            WHERE CONTACTDIR_COMPANYID = ? 
            ORDER BY CONTACTDIR_NAME ASC;
        `;
        const [contacts] = await db.query(sql, [companyId]);
        res.status(200).json(contacts);
    } catch (err) {
        console.error("Error fetching contact directory:", err);
        res.status(500).json({ message: 'Internal server error while fetching contacts.' });
    }
});

app.get('/api/notifications', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    console.log(`[API /notifications] Fetching for User: ${userId}, Company: ${companyId}`);
    try {
        const sql = `
            SELECT 
                n.NOTIFICATION_KID, n.NOTIFICATION_SUBJECT, n.NOTIFICATION_MESSAGE, 
                n.NOTIFICATION_READYN, n.NOTIFICATION_EDATETIME, u.USER_NAME AS FROM_USERNAME
            FROM T_NOTIFICATION n
            LEFT JOIN T_USER u ON n.NOTIFICATION_FROMUSERID = u.USER_KID
            WHERE n.NOTIFICATION_TOUSERID = ? AND n.NOTIFICATION_COMPANYID = ?
            ORDER BY n.NOTIFICATION_KID DESC 
            LIMIT 50;
        `;

        const [notifications] = await db.query(sql, [userId, companyId]);
        res.status(200).json(notifications);
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ message: 'Internal server error while fetching notifications.' });
    }
});

app.put('/api/notifications/read', verifyToken, async (req, res) => {
    const { notificationId } = req.body;
    const userId = req.user.id;
    if (!notificationId) {
        return res.status(400).json({ message: 'Notification ID is required.' });
    }
    console.log(`[API /notifications/read] Marking notification ${notificationId} as read for user ${userId}`);
    try {
        const sql = `
            UPDATE T_NOTIFICATION 
            SET NOTIFICATION_READYN = 'Y', NOTIFICATION_READDATETIME = NOW() 
            WHERE NOTIFICATION_KID = ? AND NOTIFICATION_TOUSERID = ?;
        `;
        const [result] = await db.query(sql, [notificationId, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Notification not found or you do not have permission to update it.' });
        }
        res.status(200).json({ message: 'Notification marked as read.' });
    } catch (err) {
        console.error("Error marking notification as read:", err);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

app.get('/api/active-employees', verifyToken, async (req, res) => {
    console.log(`[API /api/active-employees] Fetching list of active employees.`);
    try {
        const sql = `
            SELECT 
                EMPLOYEE_KID, 
                NAMEPFX_NAME, 
                EMPLOYEE_FIRSTNAME, 
                EMPLOYEE_MIDDLENAME, 
                EMPLOYEE_LASTNAME
            FROM T_EMPLOYEE
            JOIN T_NAMEPFX ON NAMEPFX_KID = EMPLOYEE_NAMEPFXID
            WHERE EMPLOYEE_STATUSID = '1'
            ORDER BY EMPLOYEE_FIRSTNAME ASC;
        `;

        const [employees] = await db.query(sql);

        const formattedEmployees = employees.map(emp => {
            const middleName = emp.EMPLOYEE_MIDDLENAME ? ` ${emp.EMPLOYEE_MIDDLENAME}` : '';
            const fullName = `${emp.NAMEPFX_NAME || ''} ${emp.EMPLOYEE_FIRSTNAME || ''}${middleName} ${emp.EMPLOYEE_LASTNAME || ''}`.replace(/\s+/g, ' ').trim();

            return {
                employee_id: emp.EMPLOYEE_KID,
                full_name: fullName
            };
        });

        res.status(200).json(formattedEmployees);

    } catch (err) {
        console.error("Error fetching active employees:", err);
        res.status(500).json({ message: 'Internal server error while fetching employees.' });
    }
});

app.get('/api/theme', verifyToken, async (req, res) => {
    const userId = req.user.id;
    console.log(`[API /theme] Fetching theme for User ID: ${userId}`);

    try {
        const sql = `
            SELECT 
                THEME_NAVBARBG, THEME_SIDEBARBG, THEME_MODULEBG, THEME_FOOTERBG,
                THEME_MENUSUBMENUBG, THEME_CURRMODULEBGANDFONTCLR, THEME_MTRSCLR,
                THEME_NAVBARFONTCLR, THEME_MENUHEADERBG 
            FROM T_THEME
            WHERE THEME_KID = (
                COALESCE(
                    (SELECT USERTHEME_THEMEID FROM T_USERTHEME WHERE USERTHEME_USERID = ?),
                    (SELECT THEME_KID FROM T_THEME WHERE THEME_DEFAULTYN = 'Y' LIMIT 1)
                )
            );
        `;

        const [results] = await db.query(sql, [userId]);

        if (results.length === 0) {
            console.error(`No theme found for User ID: ${userId}, and no default theme is configured.`);
            return res.status(404).json({ message: 'No theme could be loaded. Please contact support.' });
        }
        res.status(200).json(results[0]);
    } catch (err) {
        console.error("Error fetching theme:", err);
        res.status(500).json({ message: 'Internal server error while fetching theme.' });
    }
});

app.get('/api/themes', verifyToken, async (req, res) => {
    console.log(`[API /themes] Fetching all themes list with colors.`);
    try {
        const sql = "SELECT THEME_KID, THEME_NAME, THEME_NAVBARBG FROM T_THEME ORDER BY THEME_NAME ASC";
        const [themes] = await db.query(sql);
        res.status(200).json(themes);
    } catch (err) {
        console.error("Error fetching all themes:", err);
        res.status(500).json({ message: 'Internal server error fetching themes list.' });
    }
});

app.post('/api/user/theme', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const { themeId } = req.body;

    if (!themeId) {
        return res.status(400).json({ message: "Theme ID is required." });
    }
    console.log(`[API /user/theme] User ${userId} selected Theme ${themeId}`);

    try {
        const sql = `
            INSERT INTO T_USERTHEME (USERTHEME_USERID, USERTHEME_THEMEID, USERTHEME_EDATETIME, USERTHEME_LDATETIME)
            VALUES (?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
            USERTHEME_THEMEID = VALUES(USERTHEME_THEMEID),
            USERTHEME_LDATETIME = NOW();
        `;
        await db.query(sql, [userId, themeId]);
        res.status(200).json({ message: 'Theme updated successfully!' });
    } catch (err) {
        console.error("Error updating user theme:", err);
        res.status(500).json({ message: 'Failed to update theme.' });
    }
});


app.post('/api/users', verifyToken, async (req, res) => {
    const {
        user_category, employee_id, username, login_name,
        mobile_no, email_id, password, user_type_dropdown
    } = req.body;
    const creatorUserId = req.user.id;

    if (!username || !login_name || !password || !user_type_dropdown || !user_category) {
        return res.status(400).json({ message: 'Missing required fields. Please fill out the form completely.' });
    }
    if (user_category === 'Internal' && !employee_id) {
        return res.status(400).json({ message: 'Employee is required for internal users.' });
    }

    if (mobile_no) {
        const mobileRegex = /^[6-9]\d{9}$/;
        if (!mobileRegex.test(mobile_no)) {
            return res.status(400).json({ message: 'Invalid mobile number. It must be 10 digits starting with 6, 7, 8, or 9.' });
        }
    }
    if (email_id) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email_id)) {
            return res.status(400).json({ message: 'Invalid email address format.' });
        }
    }

    try {
        if (user_category === 'Internal' && employee_id) {
            const checkEmployeeSql = "SELECT USER_KID FROM T_USER WHERE USER_EMPLOYEEID = ? AND USER_EMPLOYEEID != 0";
            const [existingEmpUsers] = await db.query(checkEmployeeSql, [employee_id]);
            if (existingEmpUsers.length > 0) {
                return res.status(409).json({ message: 'This employee is already registered as a user.' });
            }
        }

        const checkLoginSql = "SELECT USER_KID FROM T_USER WHERE USER_LOGIN = ?";
        const [existingLoginUsers] = await db.query(checkLoginSql, [login_name]);
        if (existingLoginUsers.length > 0) {
            return res.status(409).json({ message: 'This Login Name is already taken. Please choose another.' });
        }

        if (mobile_no) {
            const checkMobileSql = "SELECT USER_KID FROM T_USER WHERE USER_MOBILENO = ?";
            const [existingMobileUsers] = await db.query(checkMobileSql, [mobile_no]);
            if (existingMobileUsers.length > 0) {
                return res.status(409).json({ message: 'This Mobile Number is already registered.' });
            }
        }
        if (email_id) {
            const checkEmailSql = "SELECT USER_KID FROM T_USER WHERE USER_EMAILID = ?";
            const [existingEmailUsers] = await db.query(checkEmailSql, [email_id]);
            if (existingEmailUsers.length > 0) {
                return res.status(409).json({ message: 'This Email ID is already registered.' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userCategoryCode = user_category === 'Internal' ? 'I' : 'E';
        const userTypeCode = user_type_dropdown.charAt(0).toUpperCase();
        const employeeId = user_category === 'Internal' ? employee_id : 0;

        const sql = `
            INSERT INTO T_USER (
                USER_TYPE, USER_CATEGORY, USER_NAME, USER_LOGIN, USER_PASSWORD,
                USER_MOBILENO, USER_EMAILID, USER_EMPLOYEEID, USER_EUSERID
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        const values = [
            userTypeCode, userCategoryCode, username, login_name, hashedPassword,
            mobile_no || null, email_id || null, employeeId, creatorUserId
        ];

        await db.query(sql, values);

        console.log(`✅ New user '${username}' created by User ID: ${creatorUserId}`);
        res.status(201).json({ message: `User '${username}' created successfully!` });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            console.error(`Error creating user: A unique field already exists (fallback).`);
            return res.status(409).json({ message: 'This Login Name, Mobile, or Email is already taken.' });
        }
        
        console.error("Error creating user:", err);
        res.status(500).json({ message: 'Internal server error while creating user.' });
    }
});


app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});