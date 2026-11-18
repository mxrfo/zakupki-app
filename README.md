zakupki-app/
├── index.html            → перенесён в src/index.html
├── build.js              → перенесён в scripts/build.js
├── package.json
├── package-lock.json
├── README.md
├── .gitignore
├── scripts/
│   └── build.js          # сборщик: инлайн CSS/JS → dist/index.html + dist/releases/app_<ts>.zip
├── src/                  # исходники
│   ├── index.html        # каркас страницы + подключение модулей (dev-режим)
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── core/         # ядро и загрузка
│       ├── api/          # взаимодействие с REST и ботом
│       ├── ui/           # интерфейс
│       └── logic/        # бизнес-логика
└── dist/                 # (не в git) результат сборки
    ├── index.html
    └── releases/         # история ZIP-архивов для откатов