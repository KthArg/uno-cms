/**
 * Lo que se le dice a quien instala cuando `/setup` no crea la cuenta (SPEC §7.3).
 *
 * Fuera de `server-only` por lo mismo que `cms/mensajes-de-subida.ts`: son textos, sin nada que
 * proteger, y así se prueban sin montar la página.
 *
 * ## Por qué «no disponible» tiene su propio mensaje
 *
 * Hasta ahora todo lo que no fuera la contraseña decía «el código de instalación no es
 * correcto». Pero `completeSetup` distingue un código que no coincide de **un despliegue que no
 * tiene `SETUP_TOKEN`**, y con el mismo mensaje para los dos, quien olvidó poner la variable se
 * pasa la tarde buscando un error de tecleo que no existe. Pasó montando el despliegue de pruebas
 * de #279.
 *
 * Decirlo no da nada a un atacante: sin `SETUP_TOKEN` no hay ningún código que adivinar, y en
 * cuanto el sitio está configurado `/setup` responde 404 antes de llegar aquí.
 */
export function mensajeDeSetup(error: string): string {
  if (error === 'password') {
    return 'Esa contraseña no vale: debe tener al menos 12 caracteres y no aparecer en listas públicas.';
  }
  if (error === 'no-disponible') {
    return (
      'Este despliegue no tiene código de instalación: falta la variable SETUP_TOKEN, o es más ' +
      'corta de 32 caracteres. Añádela en Vercel (Settings → Environment Variables) y vuelve a ' +
      'desplegar.'
    );
  }
  return 'El código de instalación no es correcto.';
}
