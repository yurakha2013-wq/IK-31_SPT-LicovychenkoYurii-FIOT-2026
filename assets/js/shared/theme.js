(function () {
    const STORAGE_KEY = "siteTheme";
    const DEFAULT_THEME = "coffee";
    const THEMES = {
        coffee: {
            label: "Кофейная",
            colorScheme: "light"
        },
        dark: {
            label: "Тёмная",
            colorScheme: "dark"
        },
        ocean: {
            label: "Футуристичная",
            colorScheme: "dark"
        },
        forest: {
            label: "Энергичная",
            colorScheme: "light"
        }
    };

    function normalizeTheme(theme) {
        if (theme === "light") return "coffee";
        if (theme === "dark") return "dark";
        return Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : DEFAULT_THEME;
    }

    function getStoredTheme() {
        try {
            const storedTheme = localStorage.getItem(STORAGE_KEY);
            if (!storedTheme) return null;
            return normalizeTheme(storedTheme);
        } catch (error) {
            return null;
        }
    }

    function getSystemTheme() {
        return DEFAULT_THEME;
    }

    function getPreferredTheme() {
        return getStoredTheme() || DEFAULT_THEME;
    }

    function getThemeMeta(theme) {
        return THEMES[normalizeTheme(theme)] || THEMES[DEFAULT_THEME];
    }

    function applyTheme(theme, options = {}) {
        const resolvedTheme = normalizeTheme(theme);
        const { persist = true, emit = true } = options;

        document.documentElement.setAttribute("data-theme", resolvedTheme);
        document.documentElement.style.colorScheme = getThemeMeta(resolvedTheme).colorScheme;

        if (persist) {
            try {
                localStorage.setItem(STORAGE_KEY, resolvedTheme);
            } catch (error) {
                /* no-op */
            }
        }

        if (emit && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("themechange", {
                detail: {
                    theme: resolvedTheme,
                    meta: getThemeMeta(resolvedTheme)
                }
            }));
        }

        return resolvedTheme;
    }

    const initialTheme = getPreferredTheme();
    applyTheme(initialTheme, { persist: false, emit: false });

    window.themeManager = {
        storageKey: STORAGE_KEY,
        defaultTheme: DEFAULT_THEME,
        themes: THEMES,
        getTheme() {
            return normalizeTheme(document.documentElement.getAttribute("data-theme") || getPreferredTheme());
        },
        getStoredTheme() {
            return getStoredTheme();
        },
        getSystemTheme() {
            return getSystemTheme();
        },
        getPreferredTheme() {
            return getPreferredTheme();
        },
        getThemeMeta(theme) {
            return getThemeMeta(theme);
        },
        setTheme(theme, options) {
            return applyTheme(theme, options);
        },
        normalizeTheme
    };
})();

