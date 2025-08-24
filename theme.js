// This function needs to be available globally for other page scripts
window.handleFetchError = async function (response) {
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('authToken');
        window.location.href = 'login.html';
        throw new Error("Redirecting due to auth error.");
    }
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    return response.json();
}

document.addEventListener('DOMContentLoaded', function () {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const fetchOptions = {
        headers: { 'Authorization': `Bearer ${token}` }
    };

    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            localStorage.removeItem('authToken');
            window.location.href = 'login.html';
            return null;
        }
    }

    const decodedToken = parseJwt(token);
    if (!decodedToken) return;

    // --- DOM ELEMENT SELECTORS ---
    const loaderOverlay = document.getElementById('th-loader-overlay');
    const userNameElement = document.getElementById('th-user-profile-name');
    const hamburger = document.getElementById('th-hamburger-menu');
    const sidebar = document.getElementById('th-sidebar'); // <-- ADDED
    const moduleToggle = document.getElementById('th-module-toggle');
    const currentModuleName = document.getElementById('th-current-module-name');
    const sidebarMenuList = document.getElementById('th-sidebar-menu-list');
    const userProfileToggle = document.getElementById('th-user-profile-toggle');
    const userDropdownMenu = document.getElementById('th-user-dropdown-menu');
    const logoutButton = document.getElementById('th-logout-button');
    const companyBrandName = document.getElementById('th-company-brand-name');
    const changePasswordLink = document.getElementById('th-change-password-link');
    const moduleDropdown = document.getElementById('th-module-dropdown');
    const moduleIcon = document.getElementById('th-module-icon');
    const changePasswordModal = document.getElementById('th-change-password-modal');
    const modalCloseButton = document.getElementById('th-modal-close-button');
    const modalUsernameInput = document.getElementById('th-modal-username');
    const changePasswordForm = document.getElementById('th-change-password-form');
    const notificationWrapper = document.getElementById('th-notification-wrapper');
    const notificationIcon = notificationWrapper.querySelector('.th-notification-icon');
    const notificationPanel = document.getElementById('th-notification-panel');
    const notificationBadge = document.getElementById('th-notification-badge');
    const notificationList = document.getElementById('th-notification-list');
    const notificationFilterContainer = document.getElementById('th-notification-filter-container');
    const messageDetailPanel = document.getElementById('th-message-detail-panel');
    const messageDetailSubject = document.getElementById('th-message-detail-subject');
    const messageDetailBody = document.getElementById('th-message-detail-body');
    const messageDetailCloseBtn = document.getElementById('th-message-detail-close-btn');
    const messageDetailFrom = document.getElementById('th-message-detail-from');
    const messageDetailTo = document.getElementById('th-message-detail-to');
    const messageDetailDatetime = document.getElementById('th-message-detail-datetime');
    const contactDirectoryModal = document.getElementById('th-contact-directory-modal');
    const contactDirCloseButton = document.getElementById('th-contact-dir-close-button');
    const contactDirectoryTbody = document.getElementById('th-contact-directory-tbody');
    const contactTableHeader = document.querySelector('#th-contact-directory-modal .th-contact-table thead');
    const issueManagementLink = document.getElementById('th-issue-management-link');
    const contactDirectoryIcon = document.getElementById('th-contact-directory-icon');
    const toolsContainer = document.querySelector('.th-tools-container');
    const toolsGearToggle = document.getElementById('th-tools-gear-toggle');
    const toolsDropdownMenu = document.getElementById('th-tools-dropdown-menu');
    const themeChangeOption = document.getElementById('th-theme-change-option');
    const themeChangeModal = document.getElementById('th-theme-change-modal');
    const themeListContainer = document.getElementById('th-theme-list-container');
    const themeModalCloseButton = document.getElementById('th-theme-modal-close-button');


    let allNotifications = [];

    const icons = {
        Dashboard: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>`,
        Master: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.258-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0l-.07.042m15.482 0l.07.042m-15.552 0l-2.298-.447a1.125 1.125 0 01.402-2.173l2.128.414a1.125 1.125 0 001.103-.89l.17-1.005a1.125 1.125 0 011.123-.88h1.18c.613 0 1.123.495 1.123 1.109l.17 1.005a1.125 1.125 0 001.103.89l2.128-.415a1.125 1.125 0 01.402 2.172l-2.298.447m-15.552 0l15.552 0" /></svg>`,
        Transaction: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`,
        Reports: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
        Setting: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.447.368.622.992.404 1.522l-1.296 2.247a1.125 1.125 0 01-1.37-.49l-1.217-.456c-.355-.133-.75-.072-1.075.124a6.57 6.57 0 01-.22.127c-.332.183-.582.495-.645.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01 .26-1.431l1.003-.827c.293-.24.438.613.438.995s-.145-.755-.438-.995l-1.003-.827a1.125 1.125 0 01-.404-1.522l1.296-2.247a1.125 1.125 0 01 1.37-.49l1.217.456c.355.133.75.072 1.075-.124.073-.044.146-.087.22-.127.332-.183.582.495.645.87l.213-1.281Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>`
    };
    const submenuArrowIcon = `<svg class="th-submenu-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>`;
    const eyeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
    const eyeSlashIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L6.228 6.228" /></svg>`;
    const checkIconSVG = `<svg class="th-check-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`;

    if (decodedToken.name) {
        userNameElement.textContent = decodedToken.name;
    }

    // --- All Functions are defined here ---

    async function loadAndApplyTheme() {
        console.log("🎨 Loading user theme from API...");
        try {
            const response = await fetch(`${BASE_URL}/api/theme`, fetchOptions);
            const theme = await window.handleFetchError(response);

            if (theme) {
                console.log("✅ API Theme data received:", theme);

                localStorage.setItem('userTheme', JSON.stringify(theme));

                const themeMap = {
                    '--primary-color': theme.THEME_NAVBARBG,
                    '--sidebar-bg': theme.THEME_SIDEBARBG,
                    '--secondary-color': theme.THEME_FOOTERBG,
                    '--module-dropdown-bg': theme.THEME_MODULEBG,
                    '--navbar-font-color': theme.THEME_NAVBARFONTCLR,
                    '--module-font-border-color': theme.THEME_CURRMODULEBGANDFONTCLR,
                    '--menu-type-font-color': theme.THEME_MTRSCLR,
                    '--menu-item-font-color': theme.THEME_CURRMODULEBGANDFONTCLR,
                    '--menu-hover-bg': theme.THEME_MENUSUBMENUBG,
                    '--menu-header-bg': theme.THEME_MENUHEADERBG // ADDED
                };

                for (const [cssVar, colorValue] of Object.entries(themeMap)) {
                    if (colorValue) {
                        document.documentElement.style.setProperty(cssVar, colorValue);
                    }
                }
            }
        } catch (error) {
            if (!error.message.includes("Redirecting")) {
                console.error("❌ Could not apply theme from API:", error);
            }
        }
    }

    async function openThemeModal() {
        themeListContainer.innerHTML = 'Loading themes...';
        themeChangeModal.style.display = 'flex';
        try {
            const response = await fetch(`${BASE_URL}/api/themes`, fetchOptions);
            const themes = await window.handleFetchError(response);

            themeListContainer.innerHTML = '';

            themes.forEach(theme => {
                const themeDiv = document.createElement('div');
                themeDiv.className = 'th-theme-option';
                themeDiv.textContent = theme.THEME_NAME;
                themeDiv.dataset.themeId = theme.THEME_KID;

                if (theme.THEME_NAVBARBG) {
                    themeDiv.dataset.hoverColor = theme.THEME_NAVBARBG;
                }

                themeDiv.addEventListener('mouseover', function () {
                    const hoverColor = this.dataset.hoverColor;
                    if (hoverColor) {
                        this.style.backgroundColor = hoverColor;
                        this.style.borderColor = hoverColor;
                        this.style.color = '#ffffff';
                    }
                });

                themeDiv.addEventListener('mouseout', function () {
                    this.style.backgroundColor = '';
                    this.style.borderColor = '';
                    this.style.color = '';
                });

                themeDiv.addEventListener('click', () => selectTheme(theme.THEME_KID));
                themeListContainer.appendChild(themeDiv);
            });
        } catch (error) {
            themeListContainer.innerHTML = 'Error loading themes.';
            console.error("Error fetching theme list", error);
        }
    }

    function closeThemeModal() {
        if (themeChangeModal) themeChangeModal.style.display = 'none';
    }

    async function selectTheme(themeId) {
        if (loaderOverlay) loaderOverlay.style.display = 'flex';
        try {
            const response = await fetch(`${BASE_URL}/api/user/theme`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...fetchOptions.headers
                },
                body: JSON.stringify({ themeId: themeId })
            });
            await window.handleFetchError(response);
            await loadAndApplyTheme();
            closeThemeModal();
        } catch (error) {
            alert('Failed to update theme. Please try again.');
            console.error("Error setting theme:", error);
        } finally {
            if (loaderOverlay) loaderOverlay.style.display = 'none';
        }
    }

    function openContactModal() {
        document.querySelectorAll('#th-contact-directory-modal .th-column-filter').forEach(input => input.value = '');
        contactDirectoryModal.style.display = 'flex';
        populateContactDirectory();
        userDropdownMenu.classList.remove('th-show');
        userProfileToggle.classList.remove('th-open');
        notificationPanel.classList.remove('th-show');
        messageDetailPanel.classList.remove('th-show');
        toolsDropdownMenu.classList.remove('th-show');
    }
    function formatDateTime(dateTimeString) { if (!dateTimeString) return ''; const options = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }; try { return new Date(dateTimeString).toLocaleString('en-US', options); } catch (e) { return dateTimeString; } }
    function formatDateTimeShort(dateTimeString) { if (!dateTimeString) return ''; const date = new Date(dateTimeString); const today = new Date(); const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear(); if (isToday) { return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); } else { return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } }
    function updateClock() { const timeElement = document.getElementById('th-live-time'); if (!timeElement) return; const now = new Date(); const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']; const day = days[now.getDay()]; let hours = now.getHours(); const minutes = String(now.getMinutes()).padStart(2, '0'); const ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12; hours = hours ? hours : 12; hours = String(hours).padStart(2, '0'); const timeString = `${day} ${hours}:${minutes} ${ampm}`; timeElement.textContent = timeString; }
    async function populateCompanyName() { try { const response = await fetch(`${BASE_URL}/api/company`, fetchOptions); const companyData = await window.handleFetchError(response); companyBrandName.textContent = companyData?.COMPANY_NAME || 'Company'; } catch (error) { if (!error.message.includes("Redirecting")) { companyBrandName.textContent = 'Not Found'; } } }
    async function populateModules() { try { const response = await fetch(`${BASE_URL}/api/modules`, fetchOptions); const modules = await window.handleFetchError(response); moduleDropdown.innerHTML = ''; modules.forEach(module => { const link = document.createElement('a'); link.href = '#'; link.textContent = module.MODULE_NAME; link.dataset.moduleId = module.MODULE_KID; link.dataset.moduleIcon = module.MODULE_ICONPATH; link.addEventListener('click', handleModuleSelection); moduleDropdown.appendChild(link); }); if (modules.length > 0) { currentModuleName.textContent = modules[0].MODULE_NAME; if (modules[0].MODULE_ICONPATH) moduleIcon.src = modules[0].MODULE_ICONPATH; loadMenuForModule(modules[0].MODULE_KID); } else { currentModuleName.textContent = "No Modules"; sidebarMenuList.innerHTML = '<li><a>No menu items available for this company.</a></li>'; } } catch (error) { if (!error.message.includes("Redirecting")) { currentModuleName.textContent = "Error"; sidebarMenuList.innerHTML = '<li><a>Error loading modules.</a></li>'; } } }
    function handleModuleSelection(e) { e.preventDefault(); currentModuleName.textContent = this.textContent; if (this.dataset.moduleIcon) moduleIcon.src = this.dataset.moduleIcon; moduleDropdown.classList.remove('th-show'); moduleToggle.classList.remove('th-open'); loadMenuForModule(this.dataset.moduleId); }
    async function loadMenuForModule(moduleId) { sidebarMenuList.innerHTML = '<li><a>Loading...</a></li>'; try { const response = await fetch(`${BASE_URL}/api/menus?moduleId=${moduleId}`, fetchOptions); const data = await window.handleFetchError(response); const menuMap = new Map(); data.forEach(item => { if (!menuMap.has(item.MENU_KID)) { menuMap.set(item.MENU_KID, { ...item, submenus: [] }); } if (item.SUBMENU_KID) { menuMap.get(item.MENU_KID).submenus.push({ id: item.SUBMENU_KID, name: item.SUBMENU_NAME, redirectPage: item.SUBMENU_REDIRECTPAGE }); } }); const groupedByType = new Map(); menuMap.forEach(menu => { if (!groupedByType.has(menu.MENU_TYPE)) groupedByType.set(menu.MENU_TYPE, []); groupedByType.get(menu.MENU_TYPE).push(menu); }); renderSidebarMenu(groupedByType); } catch (error) { if (!error.message.includes("Redirecting")) sidebarMenuList.innerHTML = '<li><a>Error loading menu.</a></li>'; } }
    function renderSidebarMenu(groupedData) { sidebarMenuList.innerHTML = ''; if (groupedData.size === 0) { sidebarMenuList.innerHTML = '<li><a>No menu items found.</a></li>'; return; } const menuOrder = ['Dashboard', 'Master', 'Transaction', 'Reports', 'Setting']; menuOrder.forEach(menuType => { if (groupedData.has(menuType)) { const menuItems = groupedData.get(menuType); const iconSVG = icons[menuType] || ''; const categoryLi = document.createElement('li'); categoryLi.classList.add('th-has-submenu'); categoryLi.innerHTML = `<a href="#"><span class="th-menu-item-content">${iconSVG}<span>${menuType}</span></span>${submenuArrowIcon}</a><ul class="th-submenu">${menuItems.map(item => { if (item.submenus.length > 0) { return `<li class="th-has-submenu"><a href="#"><span>${item.MENU_NAME}</span>${submenuArrowIcon}</a><ul class="th-submenu">${item.submenus.map(sub => `<li><a href="${sub.redirectPage || '#'}">${sub.name}</a></li>`).join('')}</ul></li>`; } else { return `<li><a href="${item.MENU_REDIRECTPAGE || '#'}"><span>${item.MENU_NAME}</span></a></li>`; } }).join('')}</ul>`; sidebarMenuList.appendChild(categoryLi); } }); initializeAccordion(); }
    async function populateCompanySwitcher() { const container = document.getElementById('th-company-list-container'); const currentCompanyId = decodedToken?.companyId; if (!container || !currentCompanyId) { container.innerHTML = '<a>Could not find company info.</a>'; return; } try { const response = await fetch(`${BASE_URL}/api/companies-for-user`, fetchOptions); const companies = await window.handleFetchError(response); container.innerHTML = ''; if (!companies || companies.length === 0) { container.innerHTML = '<a>No companies available.</a>'; return; } companies.forEach(company => { const link = document.createElement('a'); link.href = '#'; const isCurrent = company.COMPANY_KID === currentCompanyId; link.innerHTML = `${checkIconSVG}<span>${company.COMPANY_NAME}</span>`; if (isCurrent) { link.classList.add('th-active-company'); } else { link.addEventListener('click', (e) => { e.preventDefault(); switchCompany(company.COMPANY_KID); }); } container.appendChild(link); }); } catch (error) { if (!error.message.includes("Redirecting")) { container.innerHTML = '<a>Error loading companies.</a>'; } } }

    async function switchCompany(companyKid) {
        if (loaderOverlay) loaderOverlay.style.display = 'flex';

        console.log(`Attempting to switch to company ID: ${companyKid}`);
        try {
            const response = await fetch(`${BASE_URL}/api/user/switch-company`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
                body: JSON.stringify({ newCompanyKid: companyKid })
            });
            const data = await window.handleFetchError(response);
            if (data.token) {
                localStorage.setItem('authToken', data.token);
                window.location.href = 'index.html';
            } else {
                if (loaderOverlay) loaderOverlay.style.display = 'none';
                throw new Error("No new token received from server.");
            }
        } catch (error) {
            if (loaderOverlay) loaderOverlay.style.display = 'none';
            console.error('Error during company switch:', error);
            alert(`Error switching company: ${error.message}`);
        }
    }

    async function populateContactDirectory() { contactDirectoryTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading contacts...</td></tr>'; try { const response = await fetch(`${BASE_URL}/api/contact-directory`, fetchOptions); const contacts = await window.handleFetchError(response); contactDirectoryTbody.innerHTML = ''; if (!contacts || contacts.length === 0) { contactDirectoryTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No contacts found in this company.</td></tr>'; return; } contacts.forEach(contact => { const row = document.createElement('tr'); row.innerHTML = `<td>${contact.CONTACTDIR_NAME || ''}</td><td>${contact.CONTACTDIR_MOBILE || ''}</td><td>${contact.CONTACTDIR_EMAIL || ''}</td><td>${contact.CONTACTDIR_ADDRESS || ''}</td><td>${contact.CONTACTDIR_REMARK || ''}</td>`; contactDirectoryTbody.appendChild(row); }); } catch (error) { if (!error.message.includes("Redirecting")) { contactDirectoryTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error loading contacts.</td></tr>'; } } }
    function filterContactTable() { const filters = {}; document.querySelectorAll('#th-contact-directory-modal .th-column-filter').forEach(input => { const columnIndex = input.dataset.column; const filterValue = input.value.toLowerCase(); if (filterValue) { filters[columnIndex] = filterValue; } }); const rows = contactDirectoryTbody.getElementsByTagName('tr'); for (let i = 0; i < rows.length; i++) { const row = rows[i]; let displayRow = true; for (const columnIndex in filters) { const cell = row.getElementsByTagName('td')[columnIndex]; if (cell) { const cellText = cell.textContent || cell.innerText; if (cellText.toLowerCase().indexOf(filters[columnIndex]) === -1) { displayRow = false; break; } } else { displayRow = false; break; } } row.style.display = displayRow ? '' : 'none'; } }
    function renderNotificationList(filter = 'all') { notificationList.innerHTML = ''; const filteredNotifications = filter === 'unread' ? allNotifications.filter(n => n.NOTIFICATION_READYN === 'N') : allNotifications; if (filteredNotifications.length === 0) { notificationList.innerHTML = `<div class="th-no-notifications">No ${filter === 'unread' ? 'unread' : ''} messages found.</div>`; return; } filteredNotifications.forEach(n => { const item = document.createElement('div'); item.classList.add('th-notification-item'); if (n.NOTIFICATION_READYN === 'N') { item.classList.add('th-unread'); } item.dataset.id = n.NOTIFICATION_KID; item.innerHTML = `<div class="th-notification-meta"><span class="th-notification-from">${n.FROM_USERNAME || 'System'}</span><span class="th-notification-datetime">${formatDateTimeShort(n.NOTIFICATION_EDATETIME)}</span></div><div class="th-notification-subject">${n.NOTIFICATION_SUBJECT}</div>`; notificationList.appendChild(item); }); }
    async function fetchAndRenderNotifications() { try { const response = await fetch(`${BASE_URL}/api/notifications`, fetchOptions); allNotifications = await window.handleFetchError(response); let unreadCount = allNotifications.filter(n => n.NOTIFICATION_READYN === 'N').length; if (unreadCount > 0) { notificationBadge.textContent = unreadCount > 9 ? '9+' : unreadCount; notificationBadge.style.display = 'flex'; } else { notificationBadge.style.display = 'none'; } const activeFilter = notificationFilterContainer.querySelector('.th-active').dataset.filter; renderNotificationList(activeFilter); } catch (error) { if (!error.message.includes("Redirecting")) { notificationList.innerHTML = '<div class="th-no-notifications">Error loading messages.</div>'; } } }
    async function markNotificationAsRead(notificationId) { const notification = allNotifications.find(n => n.NOTIFICATION_KID == notificationId); if (!notification || notification.NOTIFICATION_READYN === 'Y') return; try { await fetch(`${BASE_URL}/api/notifications/read`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...fetchOptions.headers }, body: JSON.stringify({ notificationId }) }); notification.NOTIFICATION_READYN = 'Y'; let unreadCount = allNotifications.filter(n => n.NOTIFICATION_READYN === 'N').length; if (unreadCount > 0) { notificationBadge.textContent = unreadCount > 9 ? '9+' : unreadCount; } else { notificationBadge.style.display = 'none'; } } catch (error) { console.error('Failed to mark notification as read:', error); } }
    function openPasswordModal() { modalUsernameInput.value = decodedToken.name || 'User'; changePasswordModal.style.display = 'flex'; }
    function closePasswordModal() { changePasswordModal.style.display = 'none'; changePasswordForm.reset(); document.querySelectorAll('.th-password-input-container').forEach(container => { container.querySelector('input').type = 'password'; container.querySelector('.th-password-toggle-icon').innerHTML = eyeIconSVG; }); }
    function setupFooterLink() { if (issueManagementLink && typeof IMS_URL !== 'undefined') { issueManagementLink.href = IMS_URL; } else { console.error("Issue management link element or URL variable not found."); } }

    // --- EVENT LISTENERS ---
    hamburger.addEventListener('click', () => document.body.classList.toggle('th-sidebar-is-closed'));
    moduleToggle.addEventListener('click', (e) => { e.stopPropagation(); moduleDropdown.classList.toggle('th-show'); moduleToggle.classList.toggle('th-open'); });
    userProfileToggle.addEventListener('click', (e) => { e.stopPropagation(); userDropdownMenu.classList.toggle('th-show'); userProfileToggle.classList.toggle('th-open'); toolsDropdownMenu.classList.remove('th-show'); notificationPanel.classList.remove('th-show'); });

    logoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('authToken');
        localStorage.removeItem('userTheme');
        window.location.href = 'login.html';
    });

    changePasswordLink.addEventListener('click', (e) => { e.preventDefault(); userDropdownMenu.classList.remove('th-show'); userProfileToggle.classList.remove('th-open'); openPasswordModal(); });
    modalCloseButton.addEventListener('click', closePasswordModal);
    changePasswordModal.addEventListener('click', (e) => { if (e.target === changePasswordModal) closePasswordModal(); });
    changePasswordForm.addEventListener('submit', async (e) => { e.preventDefault(); const oldPassword = document.getElementById('th-modal-old-password').value; const newPassword = document.getElementById('th-modal-new-password').value; const retypePassword = document.getElementById('th-modal-retype-password').value; if (newPassword !== retypePassword) { alert("New passwords do not match."); return; } try { const response = await fetch(`${BASE_URL}/api/users/change-password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...fetchOptions.headers }, body: JSON.stringify({ oldPassword, newPassword }) }); const data = await window.handleFetchError(response); alert(data.message); closePasswordModal(); } catch (error) { alert(`Error: ${error.message}`); } });
    document.querySelectorAll('.th-password-toggle-icon').forEach(icon => { icon.addEventListener('click', () => { const input = icon.previousElementSibling; const isPassword = input.type === 'password'; input.type = isPassword ? 'text' : 'password'; icon.innerHTML = isPassword ? eyeSlashIconSVG : eyeIconSVG; }); });

    contactDirCloseButton.addEventListener('click', () => { contactDirectoryModal.style.display = 'none'; });
    contactDirectoryModal.addEventListener('click', (e) => { if (e.target === contactDirectoryModal) { contactDirectoryModal.style.display = 'none'; } });
    if (contactTableHeader) { contactTableHeader.addEventListener('keyup', (e) => { if (e.target.classList.contains('th-column-filter')) { filterContactTable(); } }); }
    notificationIcon.addEventListener('click', (e) => { e.stopPropagation(); notificationPanel.classList.toggle('th-show'); userDropdownMenu.classList.remove('th-show'); userProfileToggle.classList.remove('th-open'); toolsDropdownMenu.classList.remove('th-show'); });
    notificationFilterContainer.addEventListener('click', (e) => { if (e.target.matches('.th-notification-filter')) { const filter = e.target.dataset.filter; notificationFilterContainer.querySelector('.th-active').classList.remove('th-active'); e.target.classList.add('th-active'); renderNotificationList(filter); } });
    notificationList.addEventListener('click', async (e) => { const targetItem = e.target.closest('.th-notification-item'); if (targetItem) { const notificationId = targetItem.dataset.id; await markNotificationAsRead(notificationId); const notificationData = allNotifications.find(n => n.NOTIFICATION_KID == notificationId); messageDetailSubject.textContent = notificationData.NOTIFICATION_SUBJECT; messageDetailBody.textContent = notificationData.NOTIFICATION_MESSAGE; messageDetailFrom.textContent = `From: ${notificationData.FROM_USERNAME || 'System'}`; messageDetailTo.textContent = `To: ${decodedToken.name || 'Me'}`; messageDetailDatetime.textContent = formatDateTime(notificationData.NOTIFICATION_EDATETIME); messageDetailPanel.classList.add('th-show'); notificationPanel.classList.remove('th-show'); const activeFilter = notificationFilterContainer.querySelector('.th-active').dataset.filter; renderNotificationList(activeFilter); } });
    messageDetailCloseBtn.addEventListener('click', () => { messageDetailPanel.classList.remove('th-show'); });

    toolsGearToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toolsDropdownMenu.classList.toggle('th-show');
        userDropdownMenu.classList.remove('th-show');
        userProfileToggle.classList.remove('th-open');
        notificationPanel.classList.remove('th-show');
    });

    themeChangeOption.addEventListener('click', (e) => {
        e.preventDefault();
        openThemeModal();
        toolsDropdownMenu.classList.remove('th-show');
    });

    themeModalCloseButton.addEventListener('click', closeThemeModal);
    themeChangeModal.addEventListener('click', (e) => { if (e.target === themeChangeModal) closeThemeModal(); });


    contactDirectoryIcon.addEventListener('click', (e) => {
        e.preventDefault();
        openContactModal();
    });

    window.addEventListener('click', (e) => {
        const isSidebarOpen = !document.body.classList.contains('th-sidebar-is-closed');

        // Close sidebar if click is outside
        if (isSidebarOpen && sidebar && !sidebar.contains(e.target) && hamburger && !hamburger.contains(e.target)) {
            document.body.classList.add('th-sidebar-is-closed');
        }

        // Close other dropdowns
        if (moduleToggle && !moduleToggle.parentElement.contains(e.target)) { moduleDropdown.classList.remove('th-show'); moduleToggle.classList.remove('th-open'); }
        const companySwitcher = document.querySelector('.th-has-nested-dropdown');
        if (userProfileToggle && !userProfileToggle.parentElement.contains(e.target) && companySwitcher && !companySwitcher.contains(e.target)) { userDropdownMenu.classList.remove('th-show'); userProfileToggle.classList.remove('th-open'); }
        if (notificationWrapper && !notificationWrapper.contains(e.target)) { notificationPanel.classList.remove('th-show'); }
        if (messageDetailPanel.classList.contains('th-show') && !messageDetailPanel.contains(e.target) && !e.target.closest('.th-notification-item')) { messageDetailPanel.classList.remove('th-show'); }
        if (toolsContainer && !toolsContainer.contains(e.target)) {
            toolsDropdownMenu.classList.remove('th-show');
        }
    });

    function initializeAccordion() { sidebarMenuList.querySelectorAll('.th-has-submenu > a').forEach(toggle => { toggle.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); const clickedLi = this.parentElement; const parentUl = clickedLi.parentElement; const wasOpen = clickedLi.classList.contains('th-open'); Array.from(parentUl.children).forEach(siblingLi => { if (siblingLi.classList.contains('th-has-submenu')) { siblingLi.classList.remove('th-open'); siblingLi.querySelectorAll('.th-open').forEach(openSub => openSub.classList.remove('th-open')); } }); if (!wasOpen) { clickedLi.classList.add('th-open'); } }); }); }

    // --- INITIAL DATA LOAD ---
    loadAndApplyTheme();
    setupFooterLink();
    populateCompanyName();
    populateModules();
    populateCompanySwitcher();
    fetchAndRenderNotifications();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(fetchAndRenderNotifications, 60000);
});