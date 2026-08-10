# Express TypeScript Template

Backend template con Node.js, Express, TypeScript, Prisma, PostgreSQL y AWS S3.

## Características

- ✅ Authentication (Email/Password, Google OAuth, Apple OAuth)
- ✅ JWT con secretos únicos por usuario
- ✅ Upload de archivos a AWS S3
- ✅ Prisma ORM con PostgreSQL
- ✅ TypeScript
- ✅ Validación con Zod
- ✅ Logging con Winston

## Requisitos previos

- Node.js >= 16
- PostgreSQL
- AWS Account (para S3)

## Instalación

1. Clonar el repositorio y navegar a la carpeta:
```bash
cd template
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
Copia el archivo `env.example` a `.env` y configura tus variables:
```bash
cp env.example .env
```

Edita el archivo `.env` con tus credenciales:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/database_name"
PORT=3000
NODE_ENV=development

AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_bucket_name

GOOGLE_CLIENT_ID=your_google_client_id
APPLE_CLIENT_ID=your_apple_client_id
```

4. Crear la base de datos (opcional - si no existe):
```bash
./init_db.sh
```

5. Generar cliente de Prisma:
```bash
npm run db:generate
```

6. Ejecutar migraciones:
```bash
npm run db:migrate
```

## Desarrollo

Iniciar servidor en modo desarrollo:
```bash
npm run dev
```

El servidor estará corriendo en `http://localhost:3000`

## Producción

1. Compilar TypeScript:
```bash
npm run build
```

2. Iniciar servidor:
```bash
npm start
```

## Estructura del proyecto

```
template/
├── prisma/
│   └── schema.prisma          # Esquema de base de datos
├── src/
│   ├── config/
│   │   └── prisma.ts          # Configuración de Prisma
│   ├── controllers/
│   │   ├── user.controller.ts # Controlador de usuarios
│   │   └── media.controller.ts # Controlador de media
│   ├── middlewares/
│   │   ├── auth.middleware.ts # Middleware de autenticación
│   │   └── error.middleware.ts # Middleware de errores
│   ├── repositories/
│   │   ├── user.repository.ts # Repositorio de usuarios
│   │   └── jwt.repository.ts  # Repositorio de JWT
│   ├── routes/
│   │   ├── user.routes.ts     # Rutas de usuarios
│   │   └── media.routes.ts    # Rutas de media
│   ├── transformers/
│   │   └── user.transformer.ts # Transformador de usuarios
│   ├── utils/
│   │   ├── error.ts           # Utilidades de error
│   │   ├── jwt.ts             # Utilidades JWT
│   │   ├── logger.ts          # Logger
│   │   ├── s3.ts              # Utilidades S3
│   │   ├── google-auth.ts     # Google OAuth
│   │   └── apple-auth.ts      # Apple OAuth
│   ├── validators/
│   │   ├── user/              # Validadores de usuario
│   │   └── media/             # Validadores de media
│   ├── app.ts                 # Configuración de Express
│   └── server.ts              # Punto de entrada
├── package.json
├── tsconfig.json
└── README.md
```

## API Endpoints

### Users

#### Autenticación
- `POST /users/check-phone` - Verificar si existe un teléfono
- `POST /users/login` - Login con email/password
- `POST /users/google` - Login con Google OAuth
- `POST /users/apple` - Login con Apple OAuth
- `POST /users/logout` - Logout (requiere auth)

#### CRUD
- `POST /users` - Registrar usuario
- `GET /users` - Listar usuarios (requiere auth)
- `GET /users/profile` - Obtener perfil (requiere auth)
- `GET /users/:id` - Obtener usuario por ID (requiere auth)
- `PUT /users/:id` - Actualizar usuario (requiere auth)
- `DELETE /users/:id` - Eliminar usuario (requiere auth)

### Media

- `POST /media/upload` - Subir archivo a S3 (requiere auth)

## Base de datos

### Crear base de datos
```bash
./init_db.sh
```
Este script lee el `DATABASE_URL` del archivo `.env` y crea la base de datos si no existe.

### Reset de base de datos
```bash
npm run db:reset
```

### Crear nueva migración
```bash
npx prisma migrate dev --name nombre_de_migracion
```

## Tecnologías

- **Runtime**: Node.js
- **Framework**: Express.js
- **Lenguaje**: TypeScript
- **ORM**: Prisma
- **Base de datos**: PostgreSQL
- **Validación**: Zod
- **Autenticación**: JWT, Google OAuth, Apple OAuth
- **Storage**: AWS S3
- **Logger**: Winston

## Seguridad

- Contraseñas hasheadas con bcrypt
- JWT con secretos únicos por usuario
- Validación de datos con Zod
- Helmet para headers de seguridad
- CORS configurado

## Licencia

MIT

