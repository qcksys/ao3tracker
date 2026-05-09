export const landingPageHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AO3 Tracker</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
        }
        .container {
            text-align: center;
            padding: 2rem;
            max-width: 600px;
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(90deg, #9d4edd, #c77dff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .tagline {
            color: #a0a0a0;
            margin-bottom: 2rem;
            font-size: 1.1rem;
        }
        .downloads {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            align-items: center;
        }
        .download-btn {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 2rem;
            border-radius: 12px;
            text-decoration: none;
            color: #fff;
            font-weight: 500;
            font-size: 1rem;
            transition: transform 0.2s, box-shadow 0.2s;
            width: 280px;
            justify-content: center;
        }
        .download-btn:hover:not(.disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        }
        .download-btn.disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .play-store {
            background: linear-gradient(135deg, #34a853 0%, #1e8e3e 100%);
        }
        .chrome {
            background: linear-gradient(135deg, #4285f4 0%, #1a73e8 100%);
        }
        .icon {
            width: 24px;
            height: 24px;
        }
        footer {
            margin-top: 3rem;
            color: #666;
            font-size: 0.85rem;
        }
        footer a {
            color: #9d4edd;
            text-decoration: none;
        }
        footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>AO3 Tracker</h1>
        <p class="tagline">Track your reading progress on Archive of Our Own</p>
        <div class="downloads">
            <span class="download-btn play-store disabled">
                <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                </svg>
                Google Play - Coming Soon
            </span>
            <span class="download-btn chrome disabled">
                <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z"/>
                </svg>
                Chrome Extension - Coming Soon
            </span>
        </div>
        <footer>
            <p>Made by <a href="https://qcksys.com">qcksys</a></p>
        </footer>
    </div>
</body>
</html>`;
