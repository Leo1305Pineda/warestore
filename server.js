const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 8000;

// Habilitar CORS
app.use(cors());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'dist')));

// Para archivos .opus y otros
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});