(function () {
    function createFooter() {
        if (document.querySelector(".site-footer")) return;

        document.body.classList.add("has-site-footer");

        const shell = document.createElement("div");
        shell.className = "site-page-shell";

        if (document.querySelector(".login-card")) {
            shell.classList.add("center-layout", "auth-layout");
        } else if (document.getElementById("message")) {
            shell.classList.add("center-layout", "info-layout");
        }

        const nodesToMove = Array.from(document.body.children).filter(node => {
            if (node.tagName === "SCRIPT") return false;
            return !node.classList.contains("site-footer") && !node.classList.contains("site-page-shell");
        });

        nodesToMove.forEach(node => shell.appendChild(node));
        document.body.insertBefore(shell, document.body.firstChild);

        const footer = document.createElement("footer");
        footer.className = "site-footer";

        const year = new Date().getFullYear();

        footer.innerHTML = `
            <div class="site-footer-inner">
                <span class="site-footer-copy">© ${year} Scanlate Project Tracker. Усі права захищені.</span>
                <div class="site-footer-links">
                    <a class="site-footer-link" href="faq.html">FAQ</a>
                    <a
                        class="site-footer-link"
                        href="https://t.me/Siafu8"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Зворотний зв’язок
                    </a>
                </div>
            </div>
        `;

        document.body.appendChild(footer);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createFooter, { once: true });
    } else {
        createFooter();
    }
})();

