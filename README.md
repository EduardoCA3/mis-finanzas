# Mis Finanzas

Dashboard privado para registrar ingresos y gastos, importar movimientos desde CSV
y sincronizar notificaciones financieras recibidas en Gmail.

## Privacidad

El despliegue debe mantenerse en modo privado para que solo el propietario pueda
entrar con su cuenta. Los movimientos se guardan en D1. El token permanente de Gmail
se cifra antes de guardarse.

Este repositorio no incluye credenciales OAuth, tokens, movimientos financieros,
bases de datos locales ni metadatos de la cuenta usada para desplegarlo.

## Conectar Gmail

1. Crea un proyecto en Google Cloud y activa Gmail API.
2. Configura la pantalla de consentimiento como externa y agrega tu correo como usuario de prueba.
3. Crea credenciales OAuth 2.0 de tipo aplicación web.
4. Agrega como URI de redirección: `https://TU-DOMINIO/api/gmail/callback`.
5. Configura `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y una
   `GMAIL_TOKEN_ENCRYPTION_KEY` aleatoria en los secretos del sitio.
6. Entra al dashboard y pulsa **Conectar Gmail**.

La aplicación solicita únicamente permiso de lectura de Gmail. Revisa mensajes
recientes que mencionen Yape, Plin o BCP, evita duplicados y clasifica cada movimiento
con reglas locales.

## Importar CSV

El archivo debe tener las columnas `fecha`, `descripcion` y `monto`. También
acepta opcionalmente `tipo`, `categoria` y `fuente`.

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```
