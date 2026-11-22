const { cargarConfig } = require('./config');
const { crearRepoPg } = require('./repos/pgRepo');
const { crearApp } = require('./app');

async function main() {
  const config = cargarConfig();
  const repo = crearRepoPg(config.dbUrl);
  await repo.inicializar();
  crearApp({ repo, config }).listen(config.puerto, () => {
    console.log(`MS Usuarios escuchando en el puerto ${config.puerto}`);
  });
}

main().catch((e) => {
  console.error('No se pudo iniciar MS Usuarios:', e.message);
  process.exit(1);
});
